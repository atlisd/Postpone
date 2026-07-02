/* eslint-disable react-hooks/immutability, react-hooks/refs --
 * This hook IS an imperative animation engine: it drives per-frame DOM writes
 * (transforms, the ghost, the insertion indicator) through refs on purpose so
 * that dragging never re-renders React at 60fps. The react-compiler rules are
 * aimed at render-path code and do not apply to this event/rAF-driven core.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACTIVATION_DISTANCE,
  AUTO_EXPAND_MS,
  CANCEL_ANIM_MS,
  DROP_ANIM_MS,
  EDGE_SCROLL_ZONE,
  GAP_TRANSITION,
  INTO_LATCH_MS,
  MAX_SCROLL_SPEED,
  ROW_GAP,
} from './constants';
import { buildStaticMap, indicatorPosition, initialInsertion, resolvePointer, toContentY } from './geometry';
import type {
  DragSource,
  DropTarget,
  InsertionPoint,
  Resolution,
  RowMeta,
  StaticMap,
} from './types';

// Set at drag ACTIVATION (not pointerdown — that would kill plain clicks), cleared a
// tick after the drag settles. Sidebar's NavLink guards and the document capture-phase
// click listener read this to suppress the post-drag synthesized click.
let dragOccurred = false;

/** True while the click synthesized by a just-finished sidebar drag may still fire. */
export function sidebarDragJustHappened(): boolean {
  return dragOccurred;
}

interface PendingDrag {
  pointerId: number;
  startX: number;
  startY: number;
  source: DragSource;
  /** Element hidden from layout during the drag: the row div, or the whole folder wrapper. */
  blockEl: HTMLElement;
}

interface Session {
  source: DragSource;
  pointerId: number;
  blockEl: HTMLElement;
  savedInline: { display: string };
  navRect: DOMRect;
  map: StaticMap;
  /** Latest pointer position (client space). */
  clientX: number;
  clientY: number;
  moved: boolean;
  resolution: Resolution | null;
  insertion: InsertionPoint | null;
  into: { rowId: string; latched: boolean; fallback: InsertionPoint; timer: number } | null;
  expand: { folderId: string; timer: number } | null;
  /** Elements currently shifted down by the traveling gap. */
  shifted: Set<HTMLElement>;
  /** All elements that received transition/will-change (for cleanup). */
  styled: Set<HTMLElement>;
  ghostOffsetX: number;
  ghostOffsetY: number;
  ghostWidth: number;
  rafId: number;
  ended: boolean;
}

export interface DragState {
  source: DragSource;
  ghostWidth: number;
}

export interface IntoTarget {
  id: string;
  latched: boolean;
}

interface UseSidebarDragOptions {
  navRef: React.RefObject<HTMLElement | null>;
  /** dragExpandedFolderIds: folders auto-expanded during this drag (persist collapse=false if the drop landed inside one). */
  onDrop: (source: DragSource, target: DropTarget, dragExpandedFolderIds: string[]) => void;
  /** Fetch freeze: true at activation, false once the drag (incl. settle animation) is done. */
  onDragActiveChange: (active: boolean) => void;
}

export function useSidebarDrag({ navRef, onDrop, onDragActiveChange }: UseSidebarDragOptions) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [intoTarget, setIntoTarget] = useState<IntoTarget | null>(null);
  const [dragExpandedFolderIds, setDragExpandedFolderIds] = useState<string[]>([]);

  const elsRef = useRef(new Map<string, HTMLElement>());
  const metaRef = useRef(new Map<string, RowMeta>());
  const refCallbacksRef = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const structureDirtyRef = useRef(false);
  const pendingRef = useRef<PendingDrag | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const dragExpandedRef = useRef<string[]>([]);

  /** Rows register here every render; the returned callback ref is stable per id. */
  const registerRow = useCallback((meta: RowMeta) => {
    metaRef.current.set(meta.id, meta);
    let cb = refCallbacksRef.current.get(meta.id);
    if (!cb) {
      cb = (el: HTMLElement | null) => {
        if (el) {
          elsRef.current.set(meta.id, el);
        } else {
          elsRef.current.delete(meta.id);
        }
        if (sessionRef.current && !sessionRef.current.ended) structureDirtyRef.current = true;
      };
      refCallbacksRef.current.set(meta.id, cb);
    }
    return cb;
  }, []);

  const registrations = useCallback(() => {
    const out = [];
    for (const [id, el] of elsRef.current) {
      const meta = metaRef.current.get(id);
      if (meta) out.push({ ...meta, el });
    }
    return out;
  }, []);

  // ── Imperative visuals ───────────────────────────────────────────────────────

  const applyGap = useCallback((insertion: InsertionPoint | null) => {
    const s = sessionRef.current;
    if (!s) return;
    const next = new Set<HTMLElement>();
    if (insertion) {
      for (let i = insertion.gapFlatIndex; i < s.map.rows.length; i++) next.add(s.map.rows[i].el);
    }
    for (const el of s.shifted) {
      if (!next.has(el)) el.style.transform = '';
    }
    for (const el of next) {
      if (!s.shifted.has(el)) el.style.transform = `translateY(${s.map.gapHeight}px)`;
    }
    s.shifted = next;
  }, []);

  const showIndicator = useCallback((insertion: InsertionPoint | null) => {
    const s = sessionRef.current;
    const el = indicatorRef.current;
    if (!el) return;
    if (!s || !insertion) {
      el.style.opacity = '0';
      return;
    }
    const pos = indicatorPosition(insertion, s.map);
    el.style.opacity = '1';
    el.style.top = `${pos.top}px`;
    el.style.left = `${pos.left}px`;
    el.style.width = `${pos.width}px`;
  }, []);

  const clearInto = useCallback(() => {
    const s = sessionRef.current;
    if (s?.into) {
      window.clearTimeout(s.into.timer);
      s.into = null;
    }
    setIntoTarget(prev => (prev === null ? prev : null));
  }, []);

  const clearExpandTimer = useCallback(() => {
    const s = sessionRef.current;
    if (s?.expand) {
      window.clearTimeout(s.expand.timer);
      s.expand = null;
    }
  }, []);

  /** Clear transforms/transitions on every styled row. `animate` = let transforms transition back. */
  const clearRowStyles = useCallback((animate: boolean) => {
    const s = sessionRef.current;
    if (!s) return;
    for (const el of s.styled) {
      if (!animate) el.style.transition = 'none';
      el.style.transform = '';
    }
    if (!animate) {
      // Drop the transition suppression next frame so future drags animate again.
      const els = [...s.styled];
      requestAnimationFrame(() => els.forEach(el => { el.style.transition = ''; el.style.willChange = ''; }));
    } else {
      const els = [...s.styled];
      window.setTimeout(() => els.forEach(el => { el.style.transition = ''; el.style.willChange = ''; }), 200);
    }
    s.shifted = new Set();
  }, []);

  const styleRowsForDrag = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    for (const row of s.map.rows) {
      row.el.style.transition = GAP_TRANSITION;
      row.el.style.willChange = 'transform';
      s.styled.add(row.el);
    }
  }, []);

  // ── Snapshot (re)build ───────────────────────────────────────────────────────

  const rebuildMap = useCallback(() => {
    const s = sessionRef.current;
    const nav = navRef.current;
    if (!s || !nav) return;
    // Transforms corrupt getBoundingClientRect — strip them (no transition) before measuring.
    for (const el of s.styled) {
      el.style.transition = 'none';
      el.style.transform = '';
    }
    s.map = buildStaticMap(registrations(), nav, s.source, s.map.gapHeight);
    s.navRect = nav.getBoundingClientRect();
    // Everything was un-shifted for measurement — force the next resolve to re-apply.
    s.shifted = new Set();
    s.insertion = null;
    s.moved = true;
    styleRowsForDrag();
    // Re-arm transitions next frame (styleRowsForDrag set them, but we want the
    // immediate re-apply of the current gap to be instant, not animated).
    const els = [...s.styled];
    els.forEach(el => { el.style.transition = 'none'; });
    requestAnimationFrame(() => els.forEach(el => { el.style.transition = GAP_TRANSITION; }));
    structureDirtyRef.current = false;
  }, [navRef, registrations, styleRowsForDrag]);

  // ── Frame loop ───────────────────────────────────────────────────────────────

  const frame = useCallback(() => {
    const s = sessionRef.current;
    const nav = navRef.current;
    if (!s || s.ended || !nav) return;
    s.rafId = requestAnimationFrame(frame);

    // Auto-scroll near nav edges. Suppressed while an into-candidate is hovered:
    // holding still over a row's middle means "drop into this", and scrolling the
    // list under a stationary pointer would keep resetting the latch (this made
    // merging impossible for rows near the viewport edge).
    let scrolled = false;
    const { navRect } = s;
    if (!s.into && s.clientX >= navRect.left - 80 && s.clientX <= navRect.right + 80) {
      const fromTop = s.clientY - navRect.top;
      const fromBottom = navRect.bottom - s.clientY;
      let v = 0;
      if (fromTop < EDGE_SCROLL_ZONE) v = -((EDGE_SCROLL_ZONE - fromTop) / EDGE_SCROLL_ZONE) * MAX_SCROLL_SPEED;
      else if (fromBottom < EDGE_SCROLL_ZONE) v = ((EDGE_SCROLL_ZONE - fromBottom) / EDGE_SCROLL_ZONE) * MAX_SCROLL_SPEED;
      if (v !== 0) {
        const before = nav.scrollTop;
        nav.scrollTop = before + v;
        scrolled = nav.scrollTop !== before;
      }
    }

    if (structureDirtyRef.current) rebuildMap();
    else if (!s.moved && !scrolled) return;
    s.moved = false;

    // Ghost follows the pointer 1:1. (It mounts with opacity 0 so it never flashes
    // at the viewport origin before its first positioning.)
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.transform = `translate3d(${s.clientX - s.ghostOffsetX}px, ${s.clientY - s.ghostOffsetY}px, 0)`;
      ghost.style.opacity = '1';
    }

    // Pointer far outside the sidebar horizontally → no target.
    if (s.clientX < navRect.left - 80 || s.clientX > navRect.right + 80) {
      if (s.resolution !== null) {
        s.resolution = null;
        s.insertion = null;
        clearInto();
        clearExpandTimer();
        applyGap(null);
        showIndicator(null);
      }
      return;
    }

    const y = toContentY(s.clientY, s.navRect, nav.scrollTop);
    const res = resolvePointer(y, s.source, s.map, s.insertion?.gapFlatIndex ?? null);

    if (res.type === 'keep') {
      // Pointer is inside the open gap — hold the current insertion steady.
      if (s.resolution?.type === 'into') {
        clearInto();
        showIndicator(s.insertion);
      }
      s.resolution = s.insertion ? { type: 'insert', insertion: s.insertion } : null;
    } else if (res.type === 'into') {
      s.resolution = res;
      if (!s.into || s.into.rowId !== res.rowId) {
        clearInto();
        const rowId = res.rowId;
        const timer = window.setTimeout(() => {
          const cur = sessionRef.current;
          if (cur?.into && cur.into.rowId === rowId) {
            cur.into.latched = true;
            setIntoTarget({ id: rowId, latched: true });
          }
        }, INTO_LATCH_MS);
        s.into = { rowId, latched: false, fallback: res.fallback, timer };
        setIntoTarget({ id: rowId, latched: false });
      } else {
        s.into.fallback = res.fallback;
      }
      // Row highlight replaces the gap/indicator while hovering the middle zone.
      showIndicator(null);
    } else {
      s.resolution = res;
      clearInto();
      if (
        !s.insertion ||
        s.insertion.container !== res.insertion.container ||
        s.insertion.index !== res.insertion.index ||
        s.insertion.gapFlatIndex !== res.insertion.gapFlatIndex
      ) {
        s.insertion = res.insertion;
        applyGap(res.insertion);
        showIndicator(res.insertion);
      } else if (scrolled || structureDirtyRef.current) {
        showIndicator(s.insertion);
      }
    }

    // Auto-expand a collapsed folder under a dwelling pointer (project sources only).
    if (s.source.kind === 'project') {
      const hoverRow = s.map.rows.find(r => y >= r.top && y < r.top + r.height);
      const collapsedFolderId =
        hoverRow?.kind === 'folder-header' && !s.map.containers.has(hoverRow.id.replace('folder-', ''))
          ? hoverRow.id.replace('folder-', '')
          : null;
      if (collapsedFolderId !== (s.expand?.folderId ?? null)) {
        clearExpandTimer();
        if (collapsedFolderId) {
          const timer = window.setTimeout(() => {
            const cur = sessionRef.current;
            if (cur && !cur.ended) {
              // Render-only expansion: Sidebar renders the folder's children off this
              // state; the resulting re-registrations mark the geometry dirty and the
              // next frame re-snapshots.
              dragExpandedRef.current = [...dragExpandedRef.current, collapsedFolderId];
              setDragExpandedFolderIds(dragExpandedRef.current);
              cur.expand = null;
            }
          }, AUTO_EXPAND_MS);
          s.expand = { folderId: collapsedFolderId, timer };
        }
      }
    }
  }, [applyGap, clearExpandTimer, clearInto, navRef, rebuildMap, showIndicator]);

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  const teardownListeners = useRef<(() => void) | null>(null);

  const finishSession = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.ended = true;
    cancelAnimationFrame(s.rafId);
    if (s.into) window.clearTimeout(s.into.timer);
    if (s.expand) window.clearTimeout(s.expand.timer);
    document.body.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    navRef.current?.removeAttribute('data-sidebar-dragging');
    navRef.current?.style.removeProperty('padding-bottom');
    showIndicator(null);
    setIntoTarget(prev => (prev === null ? prev : null));
    window.setTimeout(() => { dragOccurred = false; }, 0);
  }, [navRef, showIndicator]);

  const endGhost = useCallback((settle: { x: number; y: number } | 'shrink' | 'fade', after: () => void) => {
    const ghost = ghostRef.current;
    if (!ghost) { after(); return; }
    const ms = typeof settle === 'string' ? CANCEL_ANIM_MS : DROP_ANIM_MS;
    ghost.style.transition = `transform ${ms}ms ease, opacity ${ms}ms ease`;
    if (settle === 'shrink') {
      ghost.style.transform += ' scale(0.9)';
      ghost.style.opacity = '0';
    } else if (settle === 'fade') {
      ghost.style.opacity = '0';
    } else {
      ghost.style.transform = `translate3d(${settle.x}px, ${settle.y}px, 0)`;
    }
    window.setTimeout(after, ms);
  }, []);

  const cancelDrag = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.ended) return;
    finishSession();
    teardownListeners.current?.();
    s.blockEl.style.display = s.savedInline.display;
    clearRowStyles(false);
    dragExpandedRef.current = [];
    setDragExpandedFolderIds([]);
    endGhost('fade', () => {
      setDragState(null);
      sessionRef.current = null;
      onDragActiveChange(false);
    });
  }, [clearRowStyles, endGhost, finishSession, onDragActiveChange]);

  const completeDrag = useCallback(() => {
    const s = sessionRef.current;
    if (!s || s.ended) return;

    // A fast drag can deliver its last pointermoves AND the pointerup inside a
    // single rAF frame — the loop never saw the final position. Resolve it
    // synchronously now so the drop lands where the pointer actually is.
    const nav = navRef.current;
    if (nav && s.moved && s.resolution !== null) {
      const y = toContentY(s.clientY, s.navRect, nav.scrollTop);
      const res = resolvePointer(y, s.source, s.map, s.insertion?.gapFlatIndex ?? null);
      if (res.type === 'insert') {
        s.resolution = res;
        s.insertion = res.insertion;
      } else if (res.type === 'keep') {
        s.resolution = s.insertion ? { type: 'insert', insertion: s.insertion } : null;
      } else if (s.into && s.into.rowId === res.rowId) {
        // Already dwelling on this row — keep the into state (latch may have fired).
        s.resolution = res;
        s.into.fallback = res.fallback;
      } else {
        // Released on a middle zone it never dwelled on: plain insertion.
        s.resolution = { type: 'insert', insertion: res.fallback };
        s.insertion = res.fallback;
      }
    }

    // Resolve the drop target from the (now current) resolution.
    let target: DropTarget = { kind: 'none' };
    const res = s.resolution;
    if (res) {
      let insertion: InsertionPoint | null = null;
      if (res.type === 'into' && s.into?.latched) {
        if (res.rowKind === 'folder-header') {
          target = { kind: 'move-to-folder', folderId: res.rowId.replace('folder-', ''), index: 0 };
        } else {
          target = { kind: 'merge-projects', targetProjectId: res.rowId };
        }
      } else if (res.type === 'into') {
        insertion = s.into?.fallback ?? res.fallback;
      } else if (res.type === 'insert') {
        insertion = res.insertion;
      }
      if (insertion) {
        if (insertion.container === 'toplevel') {
          target = { kind: 'reorder-toplevel', index: insertion.index };
        } else if (s.source.kind === 'project' && s.source.container === insertion.container) {
          target = { kind: 'reorder-in-folder', folderId: insertion.container, index: insertion.index };
        } else {
          target = { kind: 'move-to-folder', folderId: insertion.container, index: insertion.index };
        }
      }
    }

    finishSession();
    teardownListeners.current?.();

    const expandedIds = dragExpandedRef.current;
    dragExpandedRef.current = [];

    if (target.kind === 'none') {
      s.blockEl.style.display = s.savedInline.display;
      clearRowStyles(false);
      setDragExpandedFolderIds([]);
      endGhost('fade', () => {
        setDragState(null);
        sessionRef.current = null;
        onDragActiveChange(false);
      });
      return;
    }

    // Commit: restore the source row to layout, drop all gap transforms in the same
    // frame the optimistic state lands (the new layout already reflects the final
    // order, so nothing visibly jumps), then settle the ghost onto the row's new home.
    s.blockEl.style.display = s.savedInline.display;
    clearRowStyles(false);
    onDrop(s.source, target, expandedIds);
    setDragExpandedFolderIds([]);
    // Release the fetch freeze at commit, not after the settle animation — the
    // mutation chain's own fetchAll() can resolve within the animation window and
    // must not be swallowed.
    onDragActiveChange(false);

    const isInto = target.kind === 'merge-projects';
    requestAnimationFrame(() => {
      const el = elsRef.current.get(s.source.id);
      if (isInto || !el || !el.isConnected) {
        endGhost(isInto ? 'shrink' : 'fade', () => {
          setDragState(null);
          sessionRef.current = null;
        });
        return;
      }
      const rect = el.getBoundingClientRect();
      const prevVisibility = el.style.visibility;
      el.style.visibility = 'hidden';
      endGhost({ x: rect.left, y: rect.top }, () => {
        el.style.visibility = prevVisibility;
        setDragState(null);
        sessionRef.current = null;
      });
    });
  }, [clearRowStyles, endGhost, finishSession, navRef, onDrop, onDragActiveChange]);

  const activate = useCallback((pending: PendingDrag, e: PointerEvent) => {
    const nav = navRef.current;
    if (!nav) return;
    pendingRef.current = null;

    // Measure the source block, scroll position, and every row's viewport top
    // BEFORE collapsing the source out of layout.
    const blockRect = pending.blockEl.getBoundingClientRect();
    const navRectPre = nav.getBoundingClientRect();
    const sourceTopContent = blockRect.top - navRectPre.top + nav.scrollTop;
    const regs = registrations();
    const preTops = new Map<string, number>();
    for (const reg of regs) preTops.set(reg.id, reg.el.getBoundingClientRect().top);
    dragOccurred = true;

    const savedInline = { display: pending.blockEl.style.display };
    pending.blockEl.style.display = 'none';
    // The traveling gap must equal the space the collapse actually freed — not a
    // guess from the block height. They differ when e.g. the source is a folder's
    // only child (the emptied wrapper keeps its min-height): a uniform guess would
    // leave a small layout jump at activation and skew hit-testing by that delta.
    // Measured as the displacement of rows below the source (scrollHeight deltas
    // are unreliable — scrollHeight clamps at clientHeight).
    let freed = 0;
    for (const reg of regs) {
      const rect = reg.el.getBoundingClientRect();
      if (rect.height === 0) continue; // collapsed with the source
      const pre = preTops.get(reg.id);
      if (pre !== undefined) freed = Math.max(freed, pre - rect.top);
    }
    const gapHeight = freed > 1 ? Math.round(freed) : blockRect.height + ROW_GAP;
    // Collapsing the source shrinks the nav's scrollHeight; if the user is
    // scrolled near the bottom the browser clamps scrollTop and the whole list
    // jumps at drag start. Compensate with bottom padding for the drag's duration
    // (it also gives the end-of-list gap a real place to live).
    const basePaddingBottom = parseFloat(getComputedStyle(nav).paddingBottom) || 0;
    nav.style.paddingBottom = `${basePaddingBottom + gapHeight}px`;

    const session: Session = {
      source: pending.source,
      pointerId: pending.pointerId,
      blockEl: pending.blockEl,
      savedInline,
      navRect: nav.getBoundingClientRect(),
      map: buildStaticMap(registrations(), nav, pending.source, gapHeight),
      clientX: e.clientX,
      clientY: e.clientY,
      moved: true,
      resolution: null,
      insertion: null,
      into: null,
      expand: null,
      shifted: new Set(),
      styled: new Set(),
      ghostOffsetX: pending.startX - blockRect.left,
      ghostOffsetY: pending.startY - blockRect.top,
      ghostWidth: blockRect.width,
      rafId: 0,
      ended: false,
    };
    sessionRef.current = session;
    structureDirtyRef.current = false;

    styleRowsForDrag();
    // Suppress the gap-open transition on the very first application: the initial
    // gap reproduces the pre-drag layout exactly, so it must not animate.
    for (const el of session.styled) el.style.transition = 'none';
    // The initial insertion is the source's own slot (derived from identity, not
    // pointer geometry) — the opening gap restores the pre-drag visual exactly.
    const first = initialInsertion(sourceTopContent, session.source, session.map);
    session.resolution = { type: 'insert', insertion: first };
    session.insertion = first;
    applyGap(first);
    requestAnimationFrame(() => {
      if (session.ended) return;
      for (const el of session.styled) el.style.transition = GAP_TRANSITION;
      if (session.insertion) showIndicator(session.insertion);
    });

    try {
      nav.setPointerCapture(pending.pointerId);
    } catch {
      // Capture is best-effort; document listeners keep the drag alive regardless.
    }
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    nav.setAttribute('data-sidebar-dragging', 'true');

    setDragState({ source: pending.source, ghostWidth: blockRect.width });
    onDragActiveChange(true);
    session.rafId = requestAnimationFrame(frame);
  }, [applyGap, frame, navRef, onDragActiveChange, registrations, showIndicator, styleRowsForDrag]);

  const handleRowPointerDown = useCallback((
    e: React.PointerEvent,
    source: DragSource,
    blockEl?: HTMLElement,
  ) => {
    if (sessionRef.current || pendingRef.current) return;
    if (e.button !== 0) return;
    const targetEl = e.target as Element;
    if (targetEl.closest('[data-no-drag]')) return;
    // Touch/pen: only the grip starts a drag, so the list stays scrollable.
    if (e.pointerType !== 'mouse' && !targetEl.closest('[data-drag-grip]')) return;

    const pending: PendingDrag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      source,
      blockEl: blockEl ?? (e.currentTarget as HTMLElement),
    };
    pendingRef.current = pending;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pending.pointerId) return;
      const p = pendingRef.current;
      if (p) {
        if (Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) >= ACTIVATION_DISTANCE) {
          activate(p, ev);
        }
        return;
      }
      const s = sessionRef.current;
      if (s && !s.ended) {
        ev.preventDefault();
        s.clientX = ev.clientX;
        s.clientY = ev.clientY;
        s.moved = true;
      }
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pending.pointerId) return;
      if (pendingRef.current) {
        pendingRef.current = null;
        teardown();
        return;
      }
      completeDrag();
    };
    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pending.pointerId) return;
      pendingRef.current = null;
      cancelDrag();
      teardown();
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        pendingRef.current = null;
        cancelDrag();
        teardown();
      }
    };
    const onBlur = () => {
      pendingRef.current = null;
      cancelDrag();
      teardown();
    };
    const teardown = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onBlur);
      teardownListeners.current = null;
    };
    teardownListeners.current = teardown;

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onBlur);
  }, [activate, cancelDrag, completeDrag]);

  // Safety net: tear everything down if the component unmounts mid-drag.
  useEffect(() => () => {
    teardownListeners.current?.();
    const s = sessionRef.current;
    if (s && !s.ended) {
      s.ended = true;
      cancelAnimationFrame(s.rafId);
      if (s.into) window.clearTimeout(s.into.timer);
      if (s.expand) window.clearTimeout(s.expand.timer);
      s.blockEl.style.display = s.savedInline.display;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      navRef.current?.style.removeProperty('padding-bottom');
      dragOccurred = false;
    }
  }, [navRef]);

  return {
    registerRow,
    handleRowPointerDown,
    dragState,
    intoTarget,
    dragExpandedFolderIds,
    ghostRef,
    indicatorRef,
  };
}
