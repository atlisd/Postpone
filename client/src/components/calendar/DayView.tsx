import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import { useDroppable } from '@dnd-kit/react';
import type { TaskResponse } from '../../types/api';
import { CalendarTaskChip } from './CalendarTaskChip';

interface DayViewProps {
  date: Date;
  tasks: TaskResponse[];
  locale: Locale;
  onSelectTask: (task: TaskResponse) => void;
  onAddTask: (dateKey: string) => void;
}

export function DayView({ date, tasks, locale, onSelectTask, onAddTask }: DayViewProps) {
  const dateKey = format(date, 'yyyy-MM-dd');
  const { ref } = useDroppable({ id: dateKey });

  return (
    <div ref={ref} className="flex-1 p-6 overflow-y-auto">
      {tasks.length === 0 ? (
        <div
          className="flex items-center justify-center h-40 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
          onClick={() => onAddTask(dateKey)}
        >
          <span className="text-sm">No tasks — click to add</span>
        </div>
      ) : (
        <div className="space-y-1.5 max-w-xl">
          {tasks.map(task => (
            <div
              key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
              className="flex items-start gap-3"
            >
              <div className="w-12 shrink-0 text-right text-xs text-gray-400 dark:text-gray-500 pt-1 font-mono">
                {task.dueDateTime ? format(new Date(task.dueDateTime), 'p', { locale }) : ''}
              </div>
              <div className="flex-1 min-w-0">
                <CalendarTaskChip task={task} onSelect={() => onSelectTask(task)} />
              </div>
            </div>
          ))}
          <div
            className="flex items-center gap-3 mt-2 cursor-pointer group"
            onClick={() => onAddTask(dateKey)}
          >
            <div className="w-12" />
            <span className="text-xs text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300">
              + Add task
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
