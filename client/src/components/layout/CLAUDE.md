# Sidebar Drag-Drop — Architecture & Rules

> **Read this file before modifying any drag-drop logic in `Sidebar.tsx`.**
> The drag-drop system is the most regression-prone area of the codebase.
> 18+ commits have fixed/broken/re-fixed this code. Every rule below exists because removing it caused a bug.

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
- **Handler:** `onDragEnd` Branch 4 (first sub-branch: `lastTargetInSameFolder`)
- **API:** `POST /api/project-folders/{folderId}/reorder` with `{ orderedIds: [...] }`
- **State:** Uses `computeFolderDropOrder()` with `capturedLastTarget`

### 3. Cross-folder / folder-to-toplevel move
- **Trigger:** Drag a project from inside a folder to the top-level area (or vice versa)
- **Handler:** `onDragEnd` Branch 2 (folder header/dropzone detection) or Branch 4 (last sub-branch)
- **API:** `POST /api/project-folders/{id}/remove` then `POST /api/project-folders/{id}/add`

### 4. Merge to create folder
- **Trigger:** Hover one project over another for **1000ms** (merge intent timer)
- **Handler:** `onDragEnd` Branch 1 (merge intent latched)
- **API:** `POST /api/project-folders` with `{ name: "New Folder", projectIds: [source, target] }`
- **Visual:** `mergeTarget` state triggers dashed ring + folder icon overlay

### 5. Drop onto existing folder
- **Trigger:** Drop a project onto a folder header or an expanded empty folder's dropzone
- **Handler:** `onDragEnd` Branch 2
- **API:** `POST /api/project-folders/{id}/add`

## Critical Invariants — DO NOT REMOVE

### 1. `layoutVersion` forced remount
```tsx
<React.Fragment key={`toplevel-${layoutVersion}`}>
```
After every successful drop, `setLayoutVersion(v => v + 1)` forces the entire sortable subtree to remount. **Why:** dnd-kit's sortable holds internal DOM position state that gets out of sync with React's rendered order after a drag. Without this remount, the next drag starts from stale positions.

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
The four branches in `onDragEnd` fire in strict priority order with early returns:
1. **Merge intent** (hover timer fired) — highest priority
2. **Folder header/dropzone** (direct drop onto folder)
3. **Top-level reorder** (source has no `folderId`)
4. **Folder-interior** (source has a `folderId`)

**Do not reorder these branches.** Later branches have fallthrough logic that assumes earlier branches have already returned if applicable.

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
2. Optimistically update React state (`setProjects`/`setFolders`)
3. Bump `layoutVersion` to force remount
4. Fire the API call
5. On success: `fetchAll()` to re-sync with server
6. On failure: `toast.error(...)` + `fetchAll()` to revert

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
