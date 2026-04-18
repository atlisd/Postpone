# Sidebar Drag-Drop — Architecture & Rules

> **Read this file before modifying any drag-drop logic in `Sidebar.tsx`.**
> Drag-drop is historically the most regression-prone area of the codebase.
> The library migration on 2026-04-18 cleared a long backlog of pre-1.0 workarounds,
> but the remaining rules below still exist because removing them caused a bug.

## Library: `@dnd-kit/core` v6 + `@dnd-kit/sortable` v10

The whole app now uses the mature `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` packages. The pre-1.0 `@dnd-kit/react` and `@dnd-kit/dom` have been removed. Key imports:

```ts
import {
  DndContext, useDroppable, useDndMonitor, useDndContext,
  PointerSensor, KeyboardSensor, useSensor, useSensors, pointerWithin,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

**Do NOT** reference pre-1.0 `@dnd-kit/react` patterns (`useDragDropMonitor`, `isSortableOperation`, `DragDropProvider`). They no longer apply.

## Top-level `DndContext` (AppShell)

There is **one** `DndContext` in the app, mounted in `client/src/components/layout/AppShell.tsx`. Every drag flow — sidebar project/folder reorder, cross-tree task-to-sidebar drops, project task list reorder, and (inside their own isolated DndContexts) calendar chip drags and subtask reorder — registers against it via `useDndMonitor` inside feature components.

```
<DndContext sensors pointerWithin onDragEnd={...}>
  <IconSidebar />
  <Sidebar>…</Sidebar>
  <main>… ProjectTaskList / TagTaskList / SmartListView …</main>
</DndContext>
```

`AppShell`'s `onDragEnd` is a narrow dispatcher: it only runs when the drag is a `task-item` dropped onto a `project-drop` (Inbox) or `sidebar-project` target, and fires `moveTask(taskId, projectId)`. Sidebar reorder/merge logic lives in `Sidebar`'s own `useDndMonitor` subscription, not in AppShell.

Activation constraint `{ distance: 5 }` ensures plain clicks on draggable elements still fire normally.

## Component Architecture (Sidebar)

```
Sidebar (~1400 lines)
├── InboxProjectItem         — always first, useDroppable only (task drops only)
├── SortableProjectItem      — top-level ungrouped project; useSortable + drop target
├── SortableFolderItem       — folder header (useSortable) + children dropzone (useDroppable)
│   └── nested SortableContext over folder.projects
│       └── SortableProjectItem  (rendered with container = folderId)
└── useDndMonitor()          — subscribes to onDragStart/Over/End/Cancel
```

### Drag data shapes

Every draggable/droppable sets `data` so the end handler can route without DOM queries:

| Item | `type` | `container` | Extras |
|------|--------|-------------|--------|
| Top-level project | `sidebar-project` | `'toplevel'` | `projectId`, `projectName`, `folderId: null` |
| Project inside folder | `sidebar-project` | folderId | `projectId`, `projectName`, `folderId` |
| Folder header | `sidebar-folder` | `'toplevel'` | `folderId` |
| Folder children dropzone | `folder-dropzone` | — | `folderId` |
| Inbox | `project-drop` | — | `projectId`, `projectName` |
| Task chip | `task-item` | — | `taskId`, `occurrenceDate` |

`container` is the single source of truth for "is this a cross-container move?" — don't re-derive it from `active.rect` or DOM lookups.

### `SortableContext` layout

- One outer `SortableContext` containing the top-level list: `[...folderIds, ...ungroupedProjectIds]`. Strategy: `verticalListSortingStrategy`.
- One nested `SortableContext` per folder containing that folder's project IDs.
- A project rendered inside a folder registers in **both** contexts (since the same `useSortable` hook nests correctly inside SortableContext), but its `container` data field identifies which one it belongs to.

## Five Interaction Patterns

### 1. Top-level reorder (projects and folders)
- **Trigger:** Drag an ungrouped project or folder header up/down within the top-level list.
- **Handler:** `onDragEnd`, same-container branch, `active.data.container === 'toplevel' && over.data.container === 'toplevel'`.
- **Implementation:** `arrayMove(topLevelIds, oldIndex, newIndex)`, then split folders and projects back out to send the combined order.
- **API:** `POST /api/project-folders/reorder-toplevel` with `{ items: [{ type, id }] }`.

### 2. Within-folder reorder
- **Trigger:** Drag a project up/down within the same folder.
- **Handler:** `onDragEnd`, same-container branch, both `container === folderId`.
- **Implementation:** `arrayMove(folder.projects, oldIndex, newIndex)`.
- **API:** `POST /api/project-folders/{folderId}/reorder`.

### 3. Cross-folder / folder-to-toplevel move
- **Trigger:** Drag a project from one folder to another, or out to the top level (or from top level into a folder's interior — landing next to a specific project).
- **Handler:** `onDragEnd`, cross-container branch (`active.data.container !== over.data.container`).
- **API chain:** (if leaving a folder) `POST /api/project-folders/{srcId}/remove` → (if entering a folder) `POST /api/project-folders/{dstId}/add` → final reorder (`reorder-toplevel` or `/{id}/reorder`). See Invariant 3.

### 4. Merge to create folder
- **Trigger:** Hover one project over another for **1000ms** (merge intent timer).
- **Handler:** `onDragEnd`, merge-intent branch (highest priority for project sources).
- **API:** `POST /api/project-folders` with `{ name: "New Folder", projectIds: [source, target] }`.
- **Visual:** `mergeTarget` state triggers dashed ring + folder icon overlay.

### 5. Drop onto folder
- **Trigger:** Either (a) drop onto a folder's children dropzone (`type: 'folder-dropzone'`) for instant add-at-end, or (b) hover on a folder header for 1000ms (latches merge intent with a folder target) for add-at-top.
- **Handler:** `onDragEnd`, folder-dropzone branch (instant) OR merge-intent branch with folder target.
- **API (dropzone):** `POST /api/project-folders/{folderId}/add` (lands at end).
- **API (header-hover merge):** `POST /api/project-folders/{folderId}/add` → `POST /api/project-folders/{folderId}/reorder` to place at top. Both paths optimistically flip `folderId` + rewrite `folders[].projects` before the round-trip (see Invariant 3).

## Critical Invariants — DO NOT REMOVE

### 1. `dragOccurred` module-level flag — click suppression after drag
```ts
let dragOccurred = false; // module scope, NOT component state
```
Set to `true` in `onDragStart`, cleared `setTimeout(..., 0)` from `onDragEnd` / `onDragCancel`. Every NavLink inside a draggable checks it:

```tsx
onClick={(e) => { if (dragOccurred) { e.preventDefault(); return; } onClose(); }}
```

**Why module-level and not state/ref?** The post-drag `pointerup` synthesizes a click that fires synchronously before React's next render — a state update hasn't been applied yet, and a ref kept in the same component wouldn't be visible inside a child's click handler. A module-level variable is library-agnostic UI glue.

### 2. Merge intent timer (1000ms) with both refs and state
The merge system tracks:
- `mergeTargetIdRef` + `mergeIntentRef` — real-time values read inside `onDragEnd`.
- `mergeTarget` React state — triggers the dashed-ring visual re-render.

`handleDragOver` arms a 1000ms `setTimeout` the moment `over.id` matches a merge-eligible project or folder header, clears it on any target change (`mergeTargetIdRef.current !== overId`), and sets `mergeIntentRef.current = true` only when the timer expires. `onDragEnd` captures `mergeIntentRef.current` and `mergeTargetIdRef.current` into local vars **before** calling `cancelMerge()`, avoiding a race where the cleanup wipes state mid-branch.

Do not reduce the timer to "first frame" — the product behaviour is deliberate: accidental drops over a neighbour should reorder, not merge.

### 3. Cross-container moves chain `remove → add → reorder` and optimistically flip `folderId` + bump `fetchVersionRef`
`POST /.../add` and `POST /.../remove` server-side always append. To honour the user's drop position, the client must:

1. Optimistically update both `projects[i].folderId` **and** rewrite the affected `folders[j].projects` arrays before the API round-trip. Without this, the source re-renders in its old container with opacity-50 until `fetchAll` resolves — the "phantom gray project" bug.
2. Chain `reorderFolderProjects` or `reorderTopLevel` after `add`/`remove` so the server has the final position.
3. Bump `fetchVersionRef.current++` to stop any concurrent SignalR-triggered `fetchAll` from clobbering the optimistic state mid-flight.

### 4. `onDragEnd` branch priority
Branches fire in strict priority order with early returns:

0. **Folder-source guard** — `active.data.type === 'sidebar-folder'`. Folders only participate in top-level reorder; never fall into project branches (they have no matching `sourceProject`).
1. **Merge intent latched** (`mergeIntentRef.current === true`) — highest priority for project sources.
2. **Folder dropzone** (`over.data.type === 'folder-dropzone'`) — instant add-at-end.
3. **Same-container reorder** — top-level or within-folder via `arrayMove`.
4. **Cross-container move** — remove/add/reorder chain per Invariant 3.

Do not reorder these branches — later branches assume earlier ones have returned when applicable.

### 5. `fetchVersionRef` guards every optimistic mutation
Any optimistic `setProjects`/`setFolders` (reorder, cross-container move, merge) must `fetchVersionRef.current++` before the API call. `fetchAll` and the SignalR-triggered refetch both capture the version on entry and abort their `setState` if a newer version has been assigned — keeping the optimistic state visible until the real fetch catches up. Dropping a bump here reintroduces the "drag snaps back" class of bugs.

## Backend API Contracts

### Reorder top-level
```
POST /api/project-folders/reorder-toplevel
Body: { items: [{ type: "folder" | "project", id: "guid" }] }
```
Assigns `SortOrder = index` to each folder/project. Projects must be ungrouped (`folderId == null`).

### Reorder within folder
```
POST /api/project-folders/{folderId}/reorder
Body: { orderedIds: ["guid", ...] }
```
Assigns `SortOrder = index` to each project within the folder.

### Add project to folder
```
POST /api/project-folders/{folderId}/add
Body: { projectId: "guid" }
```
Sets `project.FolderId = folderId`, places at end of folder.

### Remove project from folder
```
POST /api/project-folders/{folderId}/remove
Body: { projectId: "guid" }
```
Sets `project.FolderId = null`, places at end of top-level list.

### Create folder (from merge)
```
POST /api/project-folders
Body: { name: "New Folder", projectIds: ["guid", "guid"] }
```
Creates folder with `SortOrder = min(constituent project sort orders)`.

### Collapse/expand folder
```
PATCH /api/project-folders/{folderId}/collapse
Body: { isCollapsed: true/false }
```

## Optimistic Update Pattern

All reorder operations follow this pattern:

1. Compute the intended order from `arrayMove(current, oldIndex, newIndex)` where indices come from `active.id`/`over.id`.
2. Optimistically update React state (`setProjects`/`setFolders`). For cross-container moves this MUST flip `project.folderId` AND rewrite both affected `folder.projects` arrays (Invariant 3).
3. Bump `fetchVersionRef.current++` to protect the optimistic state from in-flight `fetchAll`s (Invariant 5).
4. Fire the API call chain (for cross-container: `remove?` → `add?` → `reorder`).
5. On success: `fetchAll()` to re-sync with server.
6. On failure: `toast.error(...)` + `fetchAll()` to revert.

No forced remount is needed — `@dnd-kit/core`'s `SortableContext` rebuilds its index from the `items` prop, so a simple re-render is enough.

## Testing Checklist

After ANY modification to drag-drop code, verify all of these manually:

- [ ] **Reorder top-level:** Drag project A below project B → order persists after refresh
- [ ] **Reorder folders:** Drag folder X below folder Y → order persists
- [ ] **Reorder within folder:** Drag project inside a folder → order persists
- [ ] **Move to folder (dropzone):** Drag project into an expanded folder's empty area → project appears in folder
- [ ] **Move to folder (hover):** Hover project over folder header for 1s → dashed ring appears → drop → project moves to folder
- [ ] **Create folder (merge):** Hover project A over project B for 1s → drop → new folder created with both
- [ ] **Remove from folder:** Drag project out of folder to top-level area → project becomes ungrouped
- [ ] **Cross-folder move:** Drag project from folder A to folder B → project moves
- [ ] **Cancel mid-drag:** Start drag, press Escape → no state changes, no API calls
- [ ] **Click still works:** After a completed drag, click a project name → navigates correctly (no swallowed click)
- [ ] **Inbox immovable:** Inbox project cannot be dragged, only receives task drops
- [ ] **Shared/household projects:** Cannot create folders with or merge non-owned projects
- [ ] **Rapid consecutive drags:** Reorder, then immediately reorder again → both operations persist correctly
- [ ] **Task → sidebar:** Drag a task from `ProjectTaskList` / `SmartListView` onto any sidebar project (including Inbox) → task moves (AppShell's `onDragEnd` dispatcher)
