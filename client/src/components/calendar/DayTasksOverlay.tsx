import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { useDragDropMonitor } from '@dnd-kit/react';
import type { TaskResponse } from '../../types/api';
import { useLocale } from '../../contexts/LocaleContext';
import { CalendarTaskChip } from './CalendarTaskChip';

interface DayTasksOverlayProps {
  date: Date;
  tasks: TaskResponse[];
  anchorRect: DOMRect;
  onClose: () => void;
  onSelectTask: (task: TaskResponse) => void;
}

function OverlayContent({ date, tasks, anchorRect, onClose, onSelectTask }: DayTasksOverlayProps) {
  const { locale } = useLocale();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isMobile = window.innerWidth < 768;
  const dateLabel = format(date, 'EEEE, MMMM d', { locale });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close when a drag starts so the chip can be dropped on calendar cells
  useDragDropMonitor({
    onDragStart: () => onClose(),
  });

  if (isMobile) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div
          ref={overlayRef}
          className="relative w-full bg-white dark:bg-gray-900 rounded-t-2xl shadow-xl max-h-[70vh] flex flex-col"
        >
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{dateLabel}</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded"
            >
              <X size={16} />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 py-2 px-1 space-y-0.5">
            {tasks.map(task => (
              <div
                key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
                onClick={() => { onSelectTask(task); onClose(); }}
              >
                <CalendarTaskChip task={task} onSelect={() => { onSelectTask(task); onClose(); }} position="single" />
              </div>
            ))}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // Desktop popover — anchor near the clicked button, flip edges if needed
  const POPOVER_WIDTH = 240;
  const POPOVER_MAX_HEIGHT = 320;

  let left = anchorRect.right + 8;
  if (left + POPOVER_WIDTH > window.innerWidth - 8) {
    left = anchorRect.left - POPOVER_WIDTH - 8;
  }
  left = Math.max(8, left);

  let top = anchorRect.top;
  if (top + POPOVER_MAX_HEIGHT > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - POPOVER_MAX_HEIGHT - 8);
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <div
        ref={overlayRef}
        className="fixed z-50 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
        style={{ left, top, width: POPOVER_WIDTH, maxHeight: POPOVER_MAX_HEIGHT }}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">{dateLabel}</p>
        </div>
        <div className="overflow-y-auto flex-1 py-1 px-1 space-y-0.5">
          {tasks.map(task => (
            <div
              key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
            >
              <CalendarTaskChip task={task} onSelect={() => { onSelectTask(task); onClose(); }} position="single" />
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

export function DayTasksOverlay(props: DayTasksOverlayProps) {
  return <OverlayContent {...props} />;
}
