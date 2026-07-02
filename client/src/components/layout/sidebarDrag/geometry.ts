import { EDGE_FRACTION, ROW_GAP } from './constants';
import type {
  DragSource,
  FlatRow,
  InsertionPoint,
  Resolution,
  RowRegistration,
  StaticMap,
} from './types';

/**
 * Measure every registered row into content-space (nav-relative + scrollTop) and
 * build the flattened, visually-ordered hit-test map. The drag source (and, for a
 * folder source, its children) is excluded, so all containerIndex values are
 * already "position with the source removed" — commit code splices, never arrayMoves.
 *
 * Called once at activation and again only on structural change (auto-expand).
 * Rows must have no transforms applied when this runs.
 */
export function buildStaticMap(
  registrations: Iterable<RowRegistration>,
  navEl: HTMLElement,
  source: DragSource,
  /** Height of the traveling gap = space actually freed by collapsing the source. */
  gapHeight: number,
): StaticMap {
  const navRect = navEl.getBoundingClientRect();
  const scrollTop = navEl.scrollTop;
  const sourceFolderId = source.kind === 'folder' ? source.id.replace('folder-', '') : null;

  const rows: FlatRow[] = [];
  const containers = new Map<string, { left: number; width: number; top: number; bottom: number }>();

  for (const reg of registrations) {
    // Exclude the source row itself; for a folder source also its children rows + wrapper.
    if (reg.id === source.id) continue;
    if (sourceFolderId && (reg.container === sourceFolderId || reg.id === `children-${sourceFolderId}`)) continue;
    if (!reg.el.isConnected) continue;

    const rect = reg.el.getBoundingClientRect();
    if (rect.height === 0 && reg.kind !== 'folder-children') continue; // hidden row

    const top = rect.top - navRect.top + scrollTop;
    const bottom = rect.bottom - navRect.top + scrollTop;

    if (reg.kind === 'folder-children') {
      containers.set(reg.container, {
        left: rect.left - navRect.left,
        width: rect.width,
        top,
        bottom,
      });
      continue;
    }

    rows.push({
      id: reg.id,
      kind: reg.kind,
      container: reg.container,
      top,
      height: rect.height,
      blockBottom: bottom, // fixed up below for expanded folder headers
      containerIndex: 0,   // assigned below
      intoEligible: reg.intoEligible,
      el: reg.el,
    });
  }

  rows.sort((a, b) => a.top - b.top);

  // Assign container indices in visual order and fix up folder block extents.
  let topLevelCount = 0;
  const folderCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.kind === 'folder-header') {
      row.containerIndex = topLevelCount++;
      const folderId = row.id.replace('folder-', '');
      const wrapper = containers.get(folderId);
      if (wrapper) row.blockBottom = Math.max(row.blockBottom, wrapper.bottom);
    } else if (row.container === 'toplevel') {
      row.containerIndex = topLevelCount++;
    } else {
      const n = folderCounts.get(row.container) ?? 0;
      row.containerIndex = n;
      folderCounts.set(row.container, n + 1);
    }
  }
  // Expanded folders with all children excluded (source was the only child) still count as 0.
  for (const folderId of containers.keys()) {
    if (!folderCounts.has(folderId)) folderCounts.set(folderId, 0);
  }

  // Top-level indicator bounds: derived from the widest top-level row, falling back to the nav box.
  const firstTopLevel = rows.find(r => r.container === 'toplevel');
  containers.set('toplevel', firstTopLevel
    ? (() => {
        const r = firstTopLevel.el.getBoundingClientRect();
        return {
          left: r.left - navRect.left,
          width: r.width,
          top: rows[0]?.top ?? 0,
          bottom: rows.length ? Math.max(...rows.map(x => x.blockBottom)) : 0,
        };
      })()
    : { left: 8, width: navEl.clientWidth - 16, top: 0, bottom: navEl.scrollHeight });

  return {
    rows,
    containers,
    topLevelCount,
    folderCounts,
    gapHeight,
  };
}

/** Content-space Y of the pointer. */
export function toContentY(clientY: number, navRect: DOMRect, scrollTop: number): number {
  return clientY - navRect.top + scrollTop;
}

function flatIndexOf(map: StaticMap, row: FlatRow): number {
  return map.rows.indexOf(row);
}

/** First flat index after a top-level block starting at `headerOrRow` (skips an expanded folder's children). */
function flatIndexAfterBlock(map: StaticMap, blockRow: FlatRow): number {
  let i = flatIndexOf(map, blockRow) + 1;
  while (i < map.rows.length && map.rows[i].top < blockRow.blockBottom) i++;
  return i;
}

function insertBefore(map: StaticMap, row: FlatRow): InsertionPoint {
  return { container: row.container, index: row.containerIndex, gapFlatIndex: flatIndexOf(map, row) };
}

function insertAfterRow(map: StaticMap, row: FlatRow): InsertionPoint {
  // "After row" within its own container; the gap opens before the next flat row
  // (whole following blocks shift, which is correct for top-level insertions).
  return { container: row.container, index: row.containerIndex + 1, gapFlatIndex: flatIndexOf(map, row) + 1 };
}

function insertIntoFolderTop(map: StaticMap, header: FlatRow): InsertionPoint {
  const folderId = header.id.replace('folder-', '');
  return { container: folderId, index: 0, gapFlatIndex: flatIndexOf(map, header) + 1 };
}

function insertTopLevelAfterBlock(map: StaticMap, blockRow: FlatRow): InsertionPoint {
  return {
    container: 'toplevel',
    index: blockRow.containerIndex + 1,
    gapFlatIndex: flatIndexAfterBlock(map, blockRow),
  };
}

function insertAtEnd(map: StaticMap): InsertionPoint {
  return { container: 'toplevel', index: map.topLevelCount, gapFlatIndex: map.rows.length };
}

function insertAtFolderEnd(map: StaticMap, folderId: string, lastFlatIndex: number): InsertionPoint {
  return {
    container: folderId,
    index: map.folderCounts.get(folderId) ?? 0,
    gapFlatIndex: lastFlatIndex + 1,
  };
}

/**
 * Map a content-space pointer Y to an insertion point or an "into" zone.
 *
 * Hit-testing is displacement-aware: rows at/after the currently open gap are
 * rendered `gapHeight` lower than their static position (via transform), and the
 * user aims at what they SEE — so every comparison uses the displaced position.
 * The vacated gap interval itself is a dead zone that returns `keep`, which both
 * matches intent (pointer hovering the hole = leave it here) and prevents
 * oscillation when a resolution change would shift rows under the pointer.
 *
 * Folder sources only see top-level slots (block granularity, midpoint split).
 * Project sources get: edge zones = insert above/below, middle zone = into/merge
 * (only when both source and target are eligible; otherwise a 50/50 split).
 */
export function resolvePointer(
  y: number,
  source: DragSource,
  map: StaticMap,
  currentGapFlatIndex: number | null,
): Resolution {
  const { rows } = map;
  if (rows.length === 0) {
    return { type: 'insert', insertion: { container: 'toplevel', index: 0, gapFlatIndex: 0 } };
  }

  const disp = (flatIndex: number) =>
    currentGapFlatIndex !== null && flatIndex >= currentGapFlatIndex ? map.gapHeight : 0;

  // Dead zone: pointer inside the currently open gap. For an end-gap
  // (gapFlatIndex === rows.length) nothing is displaced and the vacated space
  // sits after the last row — without this, selecting "end of a folder" would
  // immediately re-resolve to "top level end" as the rows settle upward.
  if (currentGapFlatIndex !== null) {
    let gapStart: number;
    if (currentGapFlatIndex < rows.length) {
      gapStart = rows[currentGapFlatIndex].top;
    } else {
      const last = rows[rows.length - 1];
      gapStart = Math.max(last.blockBottom, last.top + last.height) + ROW_GAP;
    }
    if (y >= gapStart && y < gapStart + map.gapHeight) return { type: 'keep' };
  }

  if (source.kind === 'folder') return resolveForFolderSource(y, map, disp);

  // Before the first row.
  if (y < rows[0].top + disp(0)) {
    const first = rows[0];
    return {
      type: 'insert',
      insertion: first.container === 'toplevel' || first.kind === 'folder-header'
        ? insertBefore(map, first)
        : { container: first.container, index: 0, gapFlatIndex: 0 },
    };
  }

  // Direct row hit?
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const top = row.top + disp(i);
    if (y >= top && y < top + row.height) {
      return resolveRowHit(y, row, top, source, map);
    }
  }

  // Gap between rows / past the end.
  let prev = rows[0];
  let prevTop = rows[0].top + disp(0);
  let next: FlatRow | undefined;
  for (let i = 0; i < rows.length; i++) {
    const top = rows[i].top + disp(i);
    if (top + rows[i].height <= y) {
      prev = rows[i];
      prevTop = top;
      next = rows[i + 1];
    } else {
      break;
    }
  }
  return { type: 'insert', insertion: resolveGap(y, prev, prevTop, next, map) };
}

function resolveRowHit(y: number, row: FlatRow, top: number, source: DragSource, map: StaticMap): Resolution {
  const frac = (y - top) / row.height;
  const intoAllowed = source.canMerge && row.intoEligible;

  if (row.kind === 'folder-header') {
    const folderId = row.id.replace('folder-', '');
    const expanded = map.containers.has(folderId);
    const afterInsertion = expanded ? insertIntoFolderTop(map, row) : insertTopLevelAfterBlock(map, row);

    if (intoAllowed && frac >= EDGE_FRACTION && frac < 1 - EDGE_FRACTION) {
      return {
        type: 'into',
        rowId: row.id,
        rowKind: 'folder-header',
        fallback: frac < 0.5 ? insertBefore(map, row) : afterInsertion,
      };
    }
    const threshold = intoAllowed ? EDGE_FRACTION : 0.5;
    return {
      type: 'insert',
      insertion: frac < threshold ? insertBefore(map, row) : afterInsertion,
    };
  }

  // Project row.
  if (intoAllowed && frac >= EDGE_FRACTION && frac < 1 - EDGE_FRACTION) {
    return {
      type: 'into',
      rowId: row.id,
      rowKind: 'project',
      fallback: frac < 0.5 ? insertBefore(map, row) : insertAfterRow(map, row),
    };
  }
  const threshold = intoAllowed ? EDGE_FRACTION : 0.5;
  return {
    type: 'insert',
    insertion: frac < threshold ? insertBefore(map, row) : insertAfterRow(map, row),
  };
}

function resolveGap(
  y: number,
  prev: FlatRow,
  prevTop: number,
  next: FlatRow | undefined,
  map: StaticMap,
): InsertionPoint {
  // "Inside the folder" extends to the displaced bottom of its last child (the
  // static wrapper rect may lag behind displaced children).
  const insideFolderBottom = (wrapperBottom: number) =>
    Math.max(wrapperBottom, prevTop + prev.height) + ROW_GAP;

  // Gap inside a folder's children area.
  if (prev.container !== 'toplevel') {
    const folderId = prev.container;
    if (next && next.container === folderId) return insertBefore(map, next);
    const wrapper = map.containers.get(folderId);
    if (wrapper && y <= insideFolderBottom(wrapper.bottom)) {
      return insertAtFolderEnd(map, folderId, flatIndexOf(map, prev));
    }
  }
  // Gap right below an expanded folder header (empty folder, or space above first child).
  if (prev.kind === 'folder-header') {
    const folderId = prev.id.replace('folder-', '');
    const wrapper = map.containers.get(folderId);
    if (wrapper && y <= insideFolderBottom(wrapper.bottom)) {
      if (next && next.container === folderId) return insertBefore(map, next);
      return insertAtFolderEnd(map, folderId, flatIndexOf(map, prev));
    }
  }
  // Plain top-level gap.
  if (next) {
    return next.container === 'toplevel' || next.kind === 'folder-header'
      ? insertBefore(map, next)
      : { container: next.container, index: next.containerIndex, gapFlatIndex: flatIndexOf(map, next) };
  }
  return insertAtEnd(map);
}

function resolveForFolderSource(
  y: number,
  map: StaticMap,
  disp: (flatIndex: number) => number,
): Resolution {
  // Only top-level blocks are targets; children rows count as part of their block.
  // A folder-source gap only ever sits between blocks, so a whole block shares one
  // displacement (that of its first row).
  const blocks = map.rows.filter(r => r.container === 'toplevel' || r.kind === 'folder-header');
  if (blocks.length === 0) {
    return { type: 'insert', insertion: { container: 'toplevel', index: 0, gapFlatIndex: 0 } };
  }
  for (const block of blocks) {
    const d = disp(flatIndexOf(map, block));
    if (y < block.top + d) return { type: 'insert', insertion: insertBefore(map, block) };
    if (y < block.blockBottom + d) {
      const mid = (block.top + block.blockBottom) / 2 + d;
      return {
        type: 'insert',
        insertion: y < mid ? insertBefore(map, block) : insertTopLevelAfterBlock(map, block),
      };
    }
  }
  return { type: 'insert', insertion: insertAtEnd(map) };
}

/**
 * The insertion that corresponds to the source's own original slot (used at
 * activation so the initial gap restores the pre-drag visual exactly).
 *
 * Computed from identity, not pointer geometry: rows that were above the source
 * keep their static tops after the collapse, rows below slid up — so counting
 * same-container rows with `top` clearly above the source's original top gives
 * its original index with the source excluded.
 */
export function initialInsertion(sourceTopContent: number, source: DragSource, map: StaticMap): InsertionPoint {
  const threshold = sourceTopContent - 2;
  const container = source.kind === 'folder' ? 'toplevel' : source.container;
  let index = 0;
  for (const row of map.rows) {
    if (row.top >= threshold) continue;
    if (container === 'toplevel') {
      if (row.container === 'toplevel' || row.kind === 'folder-header') index++;
    } else if (row.container === container) {
      index++;
    }
  }
  let gapFlatIndex = map.rows.length;
  for (let i = 0; i < map.rows.length; i++) {
    if (map.rows[i].top >= threshold) { gapFlatIndex = i; break; }
  }
  return { container, index, gapFlatIndex };
}

/** Where to draw the 2px insertion line, in content-space. */
export function indicatorPosition(
  insertion: InsertionPoint,
  map: StaticMap,
): { top: number; left: number; width: number } {
  const geom = map.containers.get(insertion.container) ?? map.containers.get('toplevel')!;
  let top: number;
  if (insertion.gapFlatIndex < map.rows.length) {
    // Rows at/after the gap shift down by gapHeight — the line sits centered in the vacated space.
    top = map.rows[insertion.gapFlatIndex].top + map.gapHeight / 2 - 1;
  } else {
    const last = map.rows[map.rows.length - 1];
    top = (last ? Math.max(last.blockBottom, last.top + last.height) : geom.top) + ROW_GAP + 1;
  }
  return { top, left: geom.left, width: geom.width };
}
