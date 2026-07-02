# Sidebar Drag-Drop — Architecture & Rules

> **Read this file before modifying any drag-drop logic in `Sidebar.tsx` or `sidebarDrag/`.**
> Drag-drop is historically the most regression-prone area of the codebase.
> On 2026-07-02 the sidebar's project/folder dragging was moved off @dnd-kit onto a
> purpose-built pointer-events engine (`sidebarDrag/`) for Edge-tab-strip-quality
> interaction. The rules below exist because violating them caused a bug.

## Two engines, one boundary

| Flow | Engine |
|------|--------|
| Sidebar project/folder reorder, into-folder, merge | **Custom engine** — `layout/sidebarDrag/useSidebarDrag.ts` |
| Task chip → sidebar project / Inbox | @dnd-kit (AppShell `DndContext`) |
| Task reorder in `ProjectTaskList` | @dnd-kit (AppShell `DndContext`) |
| Calendar chip drags, subtask reorder | @dnd-kit (own isolated `DndContext`s) |

**The boundary invariant:** sidebar project rows keep a dnd-kit `useDroppable`
registration with data `{ type: 'sidebar-project', projectId, projectName }` (Inbox:
`type: 'project-drop'`) so AppShell's `onDragEnd` dispatcher can `moveTask()` when a
`task-item` is dropped on them. The custom engine never registers anything with
dnd-kit; dnd-kit never sees sidebar row drags (rows aren't dnd-kit draggables).
AppShell's `DndContext` uses plain `pointerWithin` — do not reintroduce per-source
collision filtering; it only existed for the old dnd-kit sidebar sortables.

## The custom engine (`sidebarDrag/`)

```
sidebarDrag/
├── constants.ts      — every timing/threshold (activation 5px, into-latch 250ms,
│                       auto-expand 500ms, edge zones 30%, scroll zone 28px, …)
├── types.ts          — RowMeta/RowRegistration, DragSource, DropTarget union,
│                       StaticMap/FlatRow, Resolution
├── geometry.ts       — pure functions: buildStaticMap, resolvePointer,
│                       initialInsertion, indicatorPosition
├── useSidebarDrag.ts — the engine hook: activation, pointer capture, rAF frame
│                       loop, imperative transforms, latch/expand timers,
│                       auto-scroll, Escape/blur cancel, drop/cancel animations
└── DragGhost.tsx     — portal ghost that follows the pointer (data-testid="drag-ghost")
```

### Interaction model (spatial zones, no merge timer)

Dragging a **project** over a row:
- **Top/bottom 30%** of a project row or folder header → insertion (blue line +
  neighbors animate apart via `translateY` transforms).
- **Middle 40%** → "into": tint appears instantly, and after a **250 ms dwell**
  the latch fires (dashed ring + FolderPlus). Released while latched: project→project
  = merge into a new folder; project→folder-header = move into that folder at index 0.
  Released before the latch: falls back to the nearest insertion — **accidental
  drops reorder, never merge** (the product rule survives; only the mechanism
  changed from a 1000 ms timer to geometry + a short dwell).
- Folder header **bottom zone** on an *expanded* folder = first slot inside it;
  on a collapsed folder = top-level slot below it.
- Middle zones only arm when the source `canMerge` (owned, non-inbox) and the
  target is `intoEligible` (owned non-inbox project; any folder). Shared/household
  projects reorder and can be inserted into folders, but never via middle zones.
- Dwelling **500 ms** over a collapsed folder auto-expands it for the drag
  (render-only via the hook's `dragExpandedFolderIds`; persisted with
  `setFolderCollapsed(false)` only if the drop lands inside).

Dragging a **folder**: top-level slots only (block granularity, midpoint split);
never nests; ghost shows the header + project-count badge; the whole wrapper
(header + children) collapses and travels as one block.

### Geometry invariants — DO NOT REMOVE

1. **One static snapshot per structural state.** `buildStaticMap` measures all
   registered rows once at activation (and again only after auto-expand), in
   content-space (`rect.top - navRect.top + scrollTop`) — scroll never invalidates
   it. Rows must have no transforms when it runs (`rebuildMap` strips them first,
   re-applies without transition in the same frame).
2. **Displacement-aware hit-testing.** Rows at/after the current gap render
   `gapHeight` lower than their static position; `resolvePointer` compares the
   pointer against these *displaced* positions because the user aims at what they
   see. Removing this reintroduces the off-by-one-row drop bug.
3. **The gap dead zone (`keep`).** A pointer inside the currently open gap keeps
   the current insertion — including the end-gap (`gapFlatIndex === rows.length`,
   where nothing is displaced and the vacated space is after the last row).
   Removing the end-gap case makes "drop at end of a folder" instantly re-resolve
   to "top-level end" as rows settle.
4. **`gapHeight` = measured freed space,** not `blockHeight + gap`. Measured as the
   max displacement of rows below the source across the collapse (`display:none`).
   `scrollHeight` deltas are wrong (clamped at `clientHeight`); a block-height guess
   is wrong when the source is a folder's only child (the emptied wrapper keeps its
   `min-h-[8px]`).
5. **`initialInsertion` is identity-based** (count same-container rows above the
   source's old top), not pointer-based — the initial gap must reproduce the
   pre-drag layout exactly, applied with transitions suppressed for one frame.
6. **Final resolve at pointerup.** A fast drag can deliver its last pointermoves and
   the `pointerup` inside one rAF frame; `completeDrag` re-resolves the final pointer
   position synchronously. An un-dwelled `into` resolves to its fallback insertion.
7. **Nav `paddingBottom` compensation.** Collapsing the source shrinks scrollHeight;
   if scrolled near the bottom the browser clamps scrollTop and the list jumps at
   grab. The engine adds `gapHeight` of bottom padding for the drag's duration.
8. **Auto-scroll is suppressed while an into-candidate is hovered** (`s.into`
   non-null). Scrolling under a stationary pointer resets the latch forever —
   without this, merging near the viewport edge is impossible.

### Performance rules

- All per-frame state lives in refs (`sessionRef`); one rAF loop coalesces
  pointermoves and only touches the DOM on actual insertion/zone changes.
- React state changes during a drag are limited to: ghost mount/unmount,
  `intoTarget` (tint/ring), `dragExpandedFolderIds`. Never add per-frame setState.
- The file has a scoped eslint-disable for `react-hooks/immutability`/`refs` —
  the engine is deliberately imperative; don't "fix" it back into React state.

## Sidebar.tsx integration

- Rows register via `registerRow(meta)` (stable callback ref per id) with kinds
  `project` / `folder-header` / `folder-children`; ids are `projectId`,
  `folder-${folderId}`, `children-${folderId}` — folder ids match
  `topLevelItems` ids so `doTopLevelReorder` is reused as-is.
- Whole row starts a drag on mouse (`onRowPointerDown`); touch/pen require the
  grip (`[data-drag-grip]`, keeps `touch-none`; rows stay scrollable).
  `[data-no-drag]` opts out (context-menu "…", share button, rename input).
  NavLinks carry `draggable={false}` (native anchor drag would eat pointer events).
- Inbox (`InboxProjectItem`), pinned items, tags, smart lists are never registered —
  they must not become engine targets.
- The defensive dedupe of `topLevelItems` / folder children protects React keys —
  keep it.

### Drop dispatch (replaces the old branch-priority rules)

The engine resolves every drop to a typed `DropTarget`; `handleDrop` is a plain
switch calling the commit functions:

| DropTarget | Commit |
|---|---|
| `reorder-toplevel` (ungrouped source / folder) | `doTopLevelReorder` (filter-source-then-splice; no-op drops early-return) |
| `reorder-toplevel` (source inside a folder) | `moveProjectToTopLevel` |
| `reorder-in-folder`, or `move-to-folder` into the source's own folder | `reorderWithinFolder` |
| `move-to-folder` | `moveProjectToFolder` (+ `persistExpansion`) |
| `merge-projects` | `mergeProjects` |

Engine indices are always "position with the source removed" — commit code
**splices, never `arrayMove`s**. Keep the try/catch around the dispatcher (an
unhandled throw would blank the page).

### Unchanged data-layer invariants (from the dnd-kit era, still load-bearing)

1. **Cross-container moves chain `remove → add → reorder`** and optimistically flip
   `project.folderId` AND rewrite affected `folders[].projects` before the round-trip
   (else the "phantom gray project" bug). `moveProjectToTopLevel` also assigns
   optimistic `sortOrder = index` so the row lands at its drop position immediately.
2. **`fetchVersionRef` barrier**: every optimistic mutation bumps it; every fetch
   snapshots it at entry and discards stale results. Per-kind fetch counters
   (`projectsFetchRef` etc.) dedupe concurrent same-kind fetches — don't merge them
   into one counter (`fetchAll` runs all four in parallel).
3. **Same-container reorders skip the success refetch** (server assigns
   `sortOrder = index`, identical to the optimistic state — a refetch is just a
   repaint cascade). Cross-container moves and merges end in `fetchAll()`.
4. **Drag freeze**: `fetchAll` defers while `dragActiveRef` is set (SignalR mid-drag
   would reshuffle geometry) and is replayed on release. The engine releases the
   freeze **at commit**, not after the settle animation — the mutation chain's own
   `fetchAll` must not be swallowed. Engine activation also bumps `fetchVersionRef`.

### Click suppression

The engine sets a module-level `dragOccurred` flag at **activation** (not
pointerdown — that would kill plain clicks), cleared a tick after the drag ends;
read via `sidebarDragJustHappened()`. Two layers consume it:
- The document capture-phase click listener in `Sidebar` calls `preventDefault()`,
  which blocks native `<a href>` navigation (full page reload) and makes React
  Router bail (`defaultPrevented`). This listener is also still required for
  dnd-kit **task-chip** drags released over sidebar links (dnd-kit's PointerSensor
  stopPropagation click-eater kills React handlers but not the anchor default).
- Per-NavLink `onClick` guards (belt-and-suspenders; also skip `onClose()` so the
  mobile sidebar stays open after a drag).
Because pointer capture retargets the post-drag synthesized click to the nav,
NavLink clicks after a real drag are already unlikely — keep all layers anyway.
The grip span keeps an unconditional `preventDefault` (it sits inside the anchor).

## Backend API Contracts (unchanged)

```
POST /api/project-folders/reorder-toplevel   { items: [{ type: "folder"|"project", id }] }
POST /api/project-folders/{folderId}/reorder { orderedIds: [...] }
POST /api/project-folders/{folderId}/add     { projectId }   (appends)
POST /api/project-folders/{folderId}/remove  { projectId }   (to end of top level)
POST /api/project-folders                    { name, projectIds }  (merge-create)
PATCH /api/project-folders/{folderId}/collapse { isCollapsed }
```
`reorder-*` assign `SortOrder = index`. `add`/`remove` always append — position is
honored by the chained reorder call.

## E2E notes (`client/e2e/`)

- `performDrag` in both drag specs **re-aims mid-drag**: coarse move with pre-drag
  coordinates, 250 ms settle, fresh `boundingBox()` (includes transforms), short
  final move. Fixed pre-measured coordinates are inherently flaky against a
  live-reordering list. `reAim: false` exists for tests that must release without
  dwelling (fast-drag-through-must-not-merge).
- Into/merge drops need `holdMs: 400` (250 ms latch + margin); `targetYRatio` maps
  to zones (≤0.3 / ≥0.7 = insert, 0.5 = into).
- Project-creation helpers must wait for the name to appear in the sidebar — the
  URL assertion alone passes vacuously after the first creation.
- Mid-drag assertions use `page.getByTestId('drag-ghost')`, not opacity classes.
- Folder wrappers expose `data-drag-id="folder-{id}"`, project rows
  `data-drag-id="{projectId}"`; the header strip is the wrapper's first `> div`.

## Testing Checklist

After ANY modification to drag-drop code, verify:

- [ ] Reorder top-level (both directions, exact slot) → persists after refresh
- [ ] Reorder folders → persists
- [ ] Reorder within folder → persists
- [ ] Into folder via header middle + dwell → lands at index 0
- [ ] Into folder via bottom-half of expanded header → index 0; via children area → exact slot
- [ ] Merge two projects (middle + dwell) → new folder; tint at once, ring at ~250 ms
- [ ] Fast drag-through a middle zone → reorders, never merges
- [ ] Drag out of folder → exact root slot
- [ ] Cross-folder move → exact slot (including last slot of the last folder)
- [ ] Collapsed folder auto-expands after 500 ms dwell; persists only if dropped inside
- [ ] Auto-scroll at nav edges (both directions); merging near the edge still works
- [ ] Escape / window blur cancels: no API calls, ghost fades, layout restores
- [ ] Post-drag click doesn't navigate; plain click does; no full-page reload ever
- [ ] Inbox not draggable, not a merge target
- [ ] Shared/household projects: reorder ok, never merge
- [ ] Rapid consecutive drags both persist
- [ ] Task chip → sidebar project & Inbox still works (ring visual + move)
- [ ] No scroll jump at grab when scrolled to the bottom
- [ ] Dark mode: ghost, tint, ring, indicator all styled
