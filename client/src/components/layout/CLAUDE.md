# Sidebar Drag-Drop — Architecture & Rules

> **Read this file before modifying any drag-drop logic in `Sidebar.tsx`.**
> The drag-drop system is the most regression-prone area of the codebase.
> 18+ commits have fixed/broken/re-fixed this code. Every rule below exists because removing it caused a bug.

> **Library migration planned (2026-04-18):** The sidebar currently uses `@dnd-kit/react` v0.3 — a **pre-1.0 rewrite** that has been a recurring source of bugs. `@dnd-kit/core` v6 + `@dnd-kit/sortable` (stable, 2.8M weekly npm downloads) is also already in `package.json` and will replace the pre-1.0 packages in a dedicated migration. Do not add significant new complexity to the v0.3 codepath without first checking whether the migration has started. Estimated migration effort: 1–2 focused days for the Sidebar (other components using `@dnd-kit/react` are simpler).

## Library: @dnd-kit/react v0.3 (pre-1.0)

The sidebar uses `@dnd-kit/react` — a **pre-1.0 rewrite** of @dnd-kit. Its API differs significantly from the older @dnd-kit v5 packages. Key imports:

```ts
import { useDroppable, useDragDropMonitor, useDragOperation } from '@dnd-kit/react';
import { useSortable, isSortableOperation } from '@dnd-kit/react/sortable';
```

**Do NOT** reference @dnd-kit v5 docs or patterns (e.g., `DndContext`, `closestCenter`, `arrayMove`). They don't apply here.

## Component Architecture

```
Sidebar (main component, ~1400 lines)
├── InboxProjectItem          — always first, NOT draggable, only a drop target for tasks
├── SortableProjectItem       — top-level ungrouped project (draggable + drop target)
├── SortableFolderItem        — folder header (draggable) + children container
│   └── FolderProjectItem     — project inside a folder (draggable + drop target)
└── useDragDropMonitor()      — centralized drag lifecycle (onDragStart/Over/Move/End)
```

### Sortable Groups

Items belong to named groups for collision/accept logic:

| Component | Group | Accepts |
|-----------|-------|---------|
| `SortableProjectItem` | `sidebar-toplevel` | `sidebar-toplevel` or `sidebar-folder-*` |
| `SortableFolderItem` | `sidebar-toplevel` | `sidebar-toplevel` or `sidebar-folder-*` |
| `FolderProjectItem` | `sidebar-folder-{folderId}` | `sidebar-toplevel` or `sidebar-folder-*` |

The `accept` callbacks on sortables allow cross-group sorting (e.g., dragging a project out of a folder into the top-level list). The `useDroppable` hooks on project items accept only **non-sidebar** drags (task chips from the project list or calendar).

## Five Interaction Patterns

### 1. Top-level reorder (projects and folders)
- **Trigger:** Drag an ungrouped project or folder header up/down within the top-level list
- **Handler:** `onDragEnd` Branch 3
- **API:** `POST /api/project-folders/reorder-toplevel` with `{ items: [{ type, id }] }`
- **State:** `runningTopLevelOrderRef` accumulates swap operations from each `onDragOver`

### 2. Within-folder reorder
- **Trigger:** Drag a project up/down within the same folder
- **Handler:** `onDragEnd` Branch 4, accumulated-order path (`usingAccumulated`)
- **API:** `POST /api/project-folders/{folderId}/reorder` with `{ orderedIds: [...] }`
- **State:** Uses `runningFolderOrderRef` (accumulated by `onDragOver`), NOT `capturedLastTarget`. See Invariant 8.

### 3. Cross-folder / folder-to-toplevel move
- **Trigger:** Drag a project from inside a folder to the top-level area (or vice versa)
- **Handler:** `onDragEnd` Branch 2 (folder header/dropzone detection) or Branch 4 (fallback paths)
- **API:** `POST /api/project-folders/{id}/remove` → `POST /api/project-folders/{id}/add` → **reorder** (see Invariant 9). The add/remove endpoints server-side always append; the follow-up reorder is what places the project at the drop position.

### 4. Merge to create folder
- **Trigger:** Hover one project over another for **1000ms** (merge intent timer)
- **Handler:** `onDragEnd` Branch 1 (merge intent latched)
- **API:** `POST /api/project-folders` with `{ name: "New Folder", projectIds: [source, target] }`
- **Visual:** `mergeTarget` state triggers dashed ring + folder icon overlay

### 5. Drop onto existing folder
- **Trigger:** Drop a project onto a folder header or an expanded empty folder's dropzone
- **Handler:** `onDragEnd` Branch 2 (instant drop) OR Branch 1 (hover 1000ms on a folder header latches merge intent with a folder target)
- **API:** `POST /api/project-folders/{id}/add` → (if header drop or merge-on-folder) `POST /api/project-folders/{id}/reorder` to place at TOP. Dropzone drops skip the reorder and land at end.
- **Invariant:** Both Branch 1 (folder-merge path) and Branch 2 optimistically flip `folderId` + rewrite both affected `folders[].projects` arrays before the API call, and both chain `reorderFolderProjects` after `add` to land at TOP. Do not regress Branch 1 to a simple `add` call — it will drop at end.

## Critical Invariants — DO NOT REMOVE

### 1. `layoutVersion` forced remount
```tsx
<React.Fragment key={`toplevel-${layoutVersion}`}>
```
After every successful drop, `setLayoutVersion(v => v + 1)` forces the entire sortable subtree to remount. **Why:** dnd-kit's sortable holds internal DOM position state that gets out of sync with React's rendered order after a drag. Without this remount, the next drag starts from stale positions.

**Safety net:** The entire `onDragEnd` body is wrapped in a `try/catch`. Any unhandled exception in a drag branch would otherwise blank the page (React error boundary). The catch logs, toasts, and calls `fetchAll()` to re-sync from the server.

### 2. `runningTopLevelOrderRef` — accumulated swap order
The `onDragOver` callback progressively builds the final intended order by replaying each swap dnd-kit reports. `onDragEnd` reads this accumulated order as the source of truth.

**Why not use dnd-kit's final target position?** Because dnd-kit's `onDragMove` fires with the cursor inside the source's new visual rect after a swap, causing `resolveTargetAtPoint` to skip the source and pick the wrong neighbor. The accumulated approach avoids this race entirely.

### 3. `resolveTargetAtPoint` — custom DOM-based target resolution
```ts
const resolveTargetAtPoint = (x, y, sourceId): string | null => { ... }
```
This function manually finds the drag target by querying `[data-drag-id]` elements and doing geometric hit-testing. **Why:** dnd-kit's built-in collision detection is unreliable — the source element tracks the cursor and always wins as "closest". This custom resolver skips the source and finds the actual target.

### 4. `dragOccurred` module-level flag
```ts
let dragOccurred = false; // module scope, NOT component state
```
Set in `onDragStart`, cleared after a tick in `onDragEnd`. Prevents the post-drag `pointerup` from triggering NavLink navigation. Must be module-level (not state/ref) because the click handler fires synchronously before React's next render.

### 5. `data-drag-id` attributes
Every draggable element must have `data-drag-id={id}` for `resolveTargetAtPoint` to find it. The IDs follow these conventions:
- Projects: `data-drag-id={project.id}` (raw GUID)
- Folders: `data-drag-id={`folder-${folder.id}`}`
- Folder dropzones: `data-drag-id={`folder-dropzone-${folder.id}`}`

### 6. Merge intent timer coordination
The merge system uses **both refs and state**:
- `mergeTargetIdRef` + `mergeIntentRef` (refs) — real-time tracking inside `onDragMove`/`onDragEnd` callbacks
- `mergeTarget` (state) — triggers visual re-render for the dashed ring overlay

The 1000ms timer is armed whenever the cursor enters a merge-eligible target and cleared whenever it leaves. At `onDragEnd`, both `mergeIntentRef` and `mergeTargetIdRef` are captured **before** `cancelMerge()` to avoid a race condition.

### 7. `onDragEnd` branch priority
`onDragEnd` fires branches in strict priority order with early returns:
0. **Folder-source branch** — `isSourceFolder === true`. Folders only participate in top-level reorder; they NEVER fall into the project branches. This isolation exists because folder sources have no matching `sourceProject` (they live in `foldersRef`, not `projectsRef`), so any project-aware branch would null-deref.
1. **Merge intent** (hover timer fired) — highest priority for projects
2. **Folder header/dropzone** (direct drop onto folder) — NOTE: this branch must NOT fall through to Branch 3 just because a transient `onDragOver` swap was accumulated; if the cursor geometrically landed on a folder header, honor it.
3. **Top-level reorder** (ungrouped project source)
4. **Folder-interior** (source has a `folderId`)

**Do not reorder these branches.** Later branches have fallthrough logic that assumes earlier branches have already returned if applicable.

### 8. Within-folder reorder MUST use `runningFolderOrderRef`, not `capturedLastTarget`
Branch 4 takes the accumulated-order path first (`usingAccumulated`). This mirrors Branch 3's use of `runningTopLevelOrderRef` and avoids the stale-DOM-hit-test race that historically caused projects to eject from their folder on a pure reorder. Only fall back to `capturedLastTarget`-based logic when the source has clearly moved outside its original folder (no accumulated order matching the origin folder).

### 9. Cross-container moves chain `remove/add → reorder` and optimistically flip `folderId`
`POST /.../add` and `POST /.../remove` server-side always append to the destination. To honour the user's drop position, the client must:
1. Optimistically update `projects[i].folderId` AND rewrite the affected `folders[j].projects` arrays **before** the API round-trip. Without this, the source re-renders in its old container with `isDragging`'s opacity-50 until `fetchAll` resolves — the "phantom gray project" bug.
2. Chain `reorderFolderProjects` or `reorderTopLevel` after the add/remove so the server has the final position.
3. Always bump `fetchVersionRef.current++` to keep any concurrent SignalR-triggered `fetchAll` from clobbering the optimistic state mid-flight.

### 10. Drop-position hint: `lastTargetPosRef`
Companion ref to `lastTargetIdRef`, updated in `onDragMove` every frame (even when the target hasn't changed — the pointer may cross the target's midpoint without switching targets). Value is `'before' | 'after'` based on pointer Y vs. target-rect midpoint. Used by cross-container branches to decide insert direction when the neighbor is another project.

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
Body: { orderedIds: ["guid", "guid", ...] }
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
1. Capture the intended order (from refs, not from dnd-kit's final state)
2. Optimistically update React state (`setProjects`/`setFolders`) — for cross-container moves, this MUST flip `project.folderId` AND rewrite both affected `folder.projects` arrays (see Invariant 9)
3. Bump `fetchVersionRef.current++` to protect the optimistic state from in-flight `fetchAll`s
4. Bump `layoutVersion` to force remount
5. Fire the API call chain (for cross-container: `remove?` → `add?` → `reorder`)
6. On success: `fetchAll()` to re-sync with server
7. On failure: `toast.error(...)` + `fetchAll()` to revert

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
- [ ] **Scroll during drag:** Start drag, scroll sidebar → target resolution still works (closest-in-Y fallback)
