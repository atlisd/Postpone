import { format } from 'date-fns';
import { useDroppable } from '@dnd-kit/react';
import type { TaskResponse } from '../../types/api';
import { CalendarTaskChip } from './CalendarTaskChip';
import type { ChipPosition } from './CalendarTaskChip';

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
  const { ref } = useDroppable({ id: dateKey });

  return (
    <div
      ref={ref}
      onMouseDown={() => onCellMouseDown?.(dateKey)}
      onMouseEnter={() => onCellMouseEnter?.(dateKey)}
      onMouseUp={() => onCellMouseUp?.(dateKey)}
      className={`border-b border-r border-gray-100 dark:border-gray-800 p-1 min-h-[80px] md:min-h-[100px] transition-colors cursor-pointer select-none ${
        isHighlighted
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
      <div className="space-y-0.5 overflow-y-auto max-h-[60px] md:max-h-[80px] -mx-1">
        {tasks.map(task => (
          <div
            key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
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
    </div>
  );
}
