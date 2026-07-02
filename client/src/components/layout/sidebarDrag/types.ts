export type RowKind = 'project' | 'folder-header' | 'folder-children';

/** Metadata a sidebar row provides when registering with the engine. */
export interface RowMeta {
  /** projectId | `folder-${folderId}` | `children-${folderId}` */
  id: string;
  kind: RowKind;
  /** 'toplevel' or the owning folderId (for folder-children rows: the folder itself). */
  container: string;
  /** May the middle zone of this row accept an "into/merge" drop? (owned, non-inbox projects; all folders) */
  intoEligible: boolean;
}

export interface RowRegistration extends RowMeta {
  el: HTMLElement;
}

/** What the user picked up. */
export interface DragSource {
  /** projectId or `folder-${folderId}` — matches topLevelItems ids. */
  id: string;
  kind: 'project' | 'folder';
  /** 'toplevel' or the folderId the project started in. */
  container: string;
  /** Owned, non-inbox project — allowed to merge / enter middle zones. */
  canMerge: boolean;
  name: string;
  color?: string;
  /** Folder sources: number of projects inside (ghost badge). */
  childCount?: number;
}

/** Resolved outcome of a drop, consumed by Sidebar's dispatcher. */
export type DropTarget =
  | { kind: 'reorder-toplevel'; index: number }
  | { kind: 'reorder-in-folder'; folderId: string; index: number }
  | { kind: 'move-to-folder'; folderId: string; index: number }
  | { kind: 'merge-projects'; targetProjectId: string }
  | { kind: 'none' };

// ── Geometry (static snapshot taken at drag activation) ──────────────────────

/** A hit-testable row in visual order. Coordinates are content-space: nav-relative + scrollTop. */
export interface FlatRow {
  id: string;
  kind: 'project' | 'folder-header';
  container: string;
  top: number;
  height: number;
  /** For folder headers: bottom of the whole block incl. visible children; else top + height. */
  blockBottom: number;
  /** Index within its container, with the drag source already excluded. Top-level rows use the interleaved slot index. */
  containerIndex: number;
  intoEligible: boolean;
  el: HTMLElement;
}

/** Horizontal + vertical bounds of a container's row area (for indicator placement / inside-folder hit tests). */
export interface ContainerGeom {
  left: number;
  width: number;
  top: number;
  bottom: number;
}

export interface StaticMap {
  rows: FlatRow[];
  /** 'toplevel' + one entry per expanded folder (its children wrapper bounds). */
  containers: Map<string, ContainerGeom>;
  /** Number of top-level slots with the source excluded. */
  topLevelCount: number;
  /** Child count per expanded folder, source excluded. */
  folderCounts: Map<string, number>;
  /** Height of the traveling gap (source block height + row gap). */
  gapHeight: number;
}

export interface InsertionPoint {
  container: string;
  index: number;
  /** Rows with flatIndex >= gapFlatIndex shift down by gapHeight. rows.length = gap at the very end. */
  gapFlatIndex: number;
}

export type Resolution =
  | { type: 'insert'; insertion: InsertionPoint }
  | {
      type: 'into';
      rowId: string;
      rowKind: 'project' | 'folder-header';
      /** Insertion used if the pointer releases before the latch fires. */
      fallback: InsertionPoint;
    }
  /** Pointer is inside the currently open gap — keep the current insertion (anti-flicker dead zone). */
  | { type: 'keep' };
