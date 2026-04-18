import { useLayoutEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import type { TaskResponse } from '../../types/api';
import { CalendarTaskChip } from './CalendarTaskChip';
import type { ChipPosition } from './CalendarTaskChip';
import { DayTasksOverlay } from './DayTasksOverlay';

const MORE_BUTTON_HEIGHT = 20;

function getChipPosition(task: TaskResponse, dateKey: string): ChipPosition {
  if (!task.endDate) return 'single';
  if (task.dueDate === dateKey) return 'start';
  if (task.endDate === dateKey) return 'end';
  return 'middle';
}

interface CalendarDayCellProps {
  date: Date;
  dateKey: string;
  tasks: TaskResponse[];
  isCurrentMonth: boolean;
  isToday: boolean;
  isHighlighted?: boolean;
  onSelectTask: (task: TaskResponse) => void;
  onCellMouseDown?: (dateKey: string) => void;
  onCellMouseEnter?: (dateKey: string) => void;
  onCellMouseUp?: (dateKey: string) => void;
}

export function CalendarDayCell({
  date,
  dateKey,
  tasks,
  isCurrentMonth,
  isToday,
  isHighlighted,
  onSelectTask,
  onCellMouseDown,
  onCellMouseEnter,
  onCellMouseUp,
}: CalendarDayCellProps) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: dateKey, data: { type: 'calendar-day' } });
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [overlayAnchor, setOverlayAnchor] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || tasks.length === 0) {
      setHiddenCount(0);
      return;
    }
    const containerH = container.clientHeight;
    // Layout not settled yet (flex height unresolved)
    if (containerH === 0) return;

    const chips = container.querySelectorAll<HTMLElement>('[data-task-chip]');
    if (chips.length === 0) {
      setHiddenCount(0);
      return;
    }

    // Use getBoundingClientRect to measure positions relative to the container,
    // independent of offsetParent (which can be a distant ancestor without position:relative)
    const containerTop = container.getBoundingClientRect().top;
    const lastChipRect = chips[chips.length - 1].getBoundingClientRect();
    const lastChipBottom = lastChipRect.bottom - containerTop;

    if (lastChipBottom <= containerH) {
      setHiddenCount(0);
      return;
    }

    // Some chips overflow — find how many fit with button space reserved
    const effectiveH = containerH - MORE_BUTTON_HEIGHT;
    let visibleCount = 0;
    for (let i = 0; i < chips.length; i++) {
      const chipBottom = chips[i].getBoundingClientRect().bottom - containerTop;
      if (chipBottom <= effectiveH) {
        visibleCount = i + 1;
      } else {
        break;
      }
    }
    setHiddenCount(tasks.length - Math.max(1, visibleCount));
  }, [tasks]);

  return (
    <div
      ref={dropRef}
      onMouseDown={() => onCellMouseDown?.(dateKey)}
      onMouseEnter={() => onCellMouseEnter?.(dateKey)}
      onMouseUp={() => onCellMouseUp?.(dateKey)}
      className={`border-b border-r border-gray-100 dark:border-gray-800 p-1 min-h-[80px] md:min-h-[100px] transition-colors cursor-pointer select-none ${
        isOver
          ? 'bg-blue-100 dark:bg-blue-900/30'
          : isHighlighted
          ? 'bg-blue-50 dark:bg-blue-900/10'
          : !isCurrentMonth
          ? 'bg-gray-50/50 dark:bg-gray-900/50'
          : ''
      }`}
    >
      <div className={`text-xs font-medium mb-1 px-1 ${
        isToday
          ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center'
          : `h-6 flex items-center ${isCurrentMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`
      }`}>
        {format(date, 'd')}
      </div>
      <div
        ref={containerRef}
        className="space-y-0.5 overflow-hidden max-h-[60px] md:max-h-[80px] -mx-1"
      >
        {tasks.map(task => (
          <div
            key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
            data-task-chip=""
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
          >
            <CalendarTaskChip
              task={task}
              onSelect={() => onSelectTask(task)}
              position={getChipPosition(task, dateKey)}
            />
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <div
          className="-mx-1"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            setOverlayAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
          }}
        >
          <button
            type="button"
            className="w-full text-left text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 px-1.5 py-0.5 transition-colors"
          >
            +{hiddenCount} more
          </button>
        </div>
      )}
      {overlayAnchor && (
        <DayTasksOverlay
          date={date}
          tasks={tasks}
          anchorRect={overlayAnchor}
          onClose={() => setOverlayAnchor(null)}
          onSelectTask={onSelectTask}
        />
      )}
    </div>
  );
}
