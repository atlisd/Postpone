import { useLayoutEffect, useRef, useState } from 'react';
import { format, isToday } from 'date-fns';
import type { Locale } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import type { TaskResponse } from '../../types/api';
import { CalendarTaskChip } from './CalendarTaskChip';
import type { ChipPosition } from './CalendarTaskChip';
import { DayTasksOverlay } from './DayTasksOverlay';

const MORE_BUTTON_HEIGHT = 24;

function getChipPosition(task: TaskResponse, dateKey: string): ChipPosition {
  if (!task.endDate) return 'single';
  if (task.dueDate === dateKey) return 'start';
  if (task.endDate === dateKey) return 'end';
  return 'middle';
}

interface WeekDayColumnProps {
  date: Date;
  dateKey: string;
  tasks: TaskResponse[];
  locale: Locale;
  isHighlighted?: boolean;
  onSelectTask: (task: TaskResponse) => void;
  onCellMouseDown: (dateKey: string) => void;
  onCellMouseEnter: (dateKey: string) => void;
  onCellMouseUp: (dateKey: string) => void;
}

export function WeekDayColumn({
  date,
  dateKey,
  tasks,
  locale,
  isHighlighted,
  onSelectTask,
  onCellMouseDown,
  onCellMouseEnter,
  onCellMouseUp,
}: WeekDayColumnProps) {
  const { setNodeRef: ref, isOver: isDropTarget } = useDroppable({ id: dateKey, data: { type: 'calendar-day' } });
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [overlayAnchor, setOverlayAnchor] = useState<DOMRect | null>(null);
  const today = isToday(date);

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

    const containerTop = container.getBoundingClientRect().top;
    const lastChipRect = chips[chips.length - 1].getBoundingClientRect();
    const lastChipBottom = lastChipRect.bottom - containerTop;

    if (lastChipBottom <= containerH) {
      setHiddenCount(0);
      return;
    }

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
      ref={ref}
      className={`flex flex-col border-r border-gray-100 dark:border-gray-800 transition-colors ${
        isDropTarget ? 'bg-blue-50 dark:bg-blue-900/10' : ''
      }`}
    >
      {/* Column header */}
      <div
        className={`p-2 text-center border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors shrink-0 select-none ${
          today ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''
        }`}
        onMouseDown={() => onCellMouseDown(dateKey)}
        onMouseEnter={() => onCellMouseEnter(dateKey)}
        onMouseUp={() => onCellMouseUp(dateKey)}
      >
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {format(date, 'EEE', { locale })}
        </div>
        <div className="flex items-center justify-center mt-0.5 h-9">
          <span className={`text-xl font-bold leading-none ${
            today
              ? 'bg-blue-600 text-white w-9 h-9 rounded-full flex items-center justify-center text-lg'
              : 'text-gray-900 dark:text-white'
          }`}>
            {format(date, 'd')}
          </span>
        </div>
      </div>

      {/* Tasks */}
      <div
        className="flex-1 flex flex-col min-h-0"
        onMouseDown={() => onCellMouseDown(dateKey)}
        onMouseEnter={() => onCellMouseEnter(dateKey)}
        onMouseUp={() => onCellMouseUp(dateKey)}
      >
        <div
          ref={containerRef}
          className={`flex-1 py-1 space-y-0.5 overflow-hidden cursor-pointer min-h-[120px] select-none -mx-1 ${
            isHighlighted && !isDropTarget ? 'bg-blue-50 dark:bg-blue-900/10' : ''
          }`}
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
            className="-mx-1 shrink-0"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              setOverlayAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
            }}
          >
            <button
              type="button"
              className="w-full text-left text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 px-1.5 py-1 transition-colors"
            >
              +{hiddenCount} more
            </button>
          </div>
        )}
      </div>
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

interface WeekViewProps {
  days: Date[];
  tasksByDate: Map<string, TaskResponse[]>;
  locale: Locale;
  highlightedRange: { start: string; end: string } | null;
  onSelectTask: (task: TaskResponse) => void;
  onCellMouseDown: (dateKey: string) => void;
  onCellMouseEnter: (dateKey: string) => void;
  onCellMouseUp: (dateKey: string) => void;
}

export function WeekView({ days, tasksByDate, locale, highlightedRange, onSelectTask, onCellMouseDown, onCellMouseEnter, onCellMouseUp }: WeekViewProps) {
  return (
    <div
      className="flex-1 grid min-h-0 overflow-y-auto"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const isHighlighted = !!highlightedRange && dateKey >= highlightedRange.start && dateKey <= highlightedRange.end;
        return (
          <WeekDayColumn
            key={dateKey}
            date={day}
            dateKey={dateKey}
            tasks={tasksByDate.get(dateKey) ?? []}
            locale={locale}
            isHighlighted={isHighlighted}
            onSelectTask={onSelectTask}
            onCellMouseDown={onCellMouseDown}
            onCellMouseEnter={onCellMouseEnter}
            onCellMouseUp={onCellMouseUp}
          />
        );
      })}
    </div>
  );
}
