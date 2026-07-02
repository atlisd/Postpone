import { forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Folder, FolderOpen } from 'lucide-react';
import type { DragSource } from './types';

interface DragGhostProps {
  source: DragSource;
  width: number;
}

/**
 * The floating row that follows the pointer during a sidebar drag. Positioned
 * imperatively by useSidebarDrag via transform on the ref — no React re-renders
 * while dragging. Folder ghosts show the header + a project-count badge (a full
 * clone of header + children would obscure the drop targets).
 */
export const DragGhost = forwardRef<HTMLDivElement, DragGhostProps>(function DragGhost(
  { source, width },
  ref,
) {
  return createPortal(
    <div
      ref={ref}
      data-testid="drag-ghost"
      className="fixed top-0 left-0 z-[100] pointer-events-none will-change-transform"
      style={{ width, opacity: 0 }}
    >
      <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm scale-[1.02] shadow-lg ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
        {source.kind === 'folder' ? (
          <>
            <Folder size={16} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
            <span className="flex-1 truncate font-medium">{source.name}</span>
            {(source.childCount ?? 0) > 0 && (
              <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {source.childCount}
              </span>
            )}
          </>
        ) : (
          <>
            <FolderOpen size={16} className="flex-shrink-0" style={{ color: source.color }} />
            <span className="flex-1 truncate">{source.name}</span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
});
