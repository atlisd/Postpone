import { format } from 'date-fns';
import { useDroppable } from '@dnd-kit/react';
import type { TaskResponse } from '../../types/api';
import { CalendarTaskChip } from './CalendarTaskChip';

interface CalendarDayCellProps {
  date: Date;
  dateKey: string;
  tasks: TaskResponse[];
  isCurrentMonth: boolean;
  isToday: boolean;
  onSelectTask: (task: TaskResponse) => void;
  onAddTask?: (dateKey: string) => void;
}

export function CalendarDayCell({ date, dateKey, tasks, isCurrentMonth, isToday, onSelectTask, onAddTask }: CalendarDayCellProps) {
  const { ref } = useDroppable({ id: dateKey });

  return (
    <div
      ref={ref}
      onClick={() => onAddTask?.(dateKey)}
      className={`border-b border-r border-gray-100 dark:border-gray-800 p-1 min-h-[80px] md:min-h-[100px] transition-colors cursor-pointer ${
        !isCurrentMonth ? 'bg-gray-50/50 dark:bg-gray-900/50' : ''
      }`}
    >
      <div className={`text-xs font-medium mb-1 px-1 ${
        isToday
          ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center'
          : isCurrentMonth
            ? 'text-gray-700 dark:text-gray-300'
            : 'text-gray-400 dark:text-gray-600'
      }`}>
        {format(date, 'd')}
      </div>
      <div className="space-y-0.5 overflow-y-auto max-h-[60px] md:max-h-[80px]">
        {tasks.map(task => (
          <div key={task.id} onClick={e => e.stopPropagation()}>
            <CalendarTaskChip
              task={task}
              onSelect={() => onSelectTask(task)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
