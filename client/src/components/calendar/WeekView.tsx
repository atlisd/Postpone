import { format, isToday } from 'date-fns';
import type { Locale } from 'date-fns';
import { useDroppable } from '@dnd-kit/react';
import type { TaskResponse } from '../../types/api';
import { CalendarTaskChip } from './CalendarTaskChip';

interface WeekDayColumnProps {
  date: Date;
  dateKey: string;
  tasks: TaskResponse[];
  locale: Locale;
  onSelectTask: (task: TaskResponse) => void;
  onAddTask: (dateKey: string) => void;
}

function WeekDayColumn({ date, dateKey, tasks, locale, onSelectTask, onAddTask }: WeekDayColumnProps) {
  const { ref, isDropTarget } = useDroppable({ id: dateKey });
  const today = isToday(date);

  return (
    <div
      ref={ref}
      className={`flex flex-col border-r border-gray-100 dark:border-gray-800 transition-colors ${
        isDropTarget ? 'bg-blue-50 dark:bg-blue-900/10' : ''
      }`}
    >
      {/* Column header */}
      <div
        className={`p-2 text-center border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors shrink-0 ${
          today ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''
        }`}
        onClick={() => onAddTask(dateKey)}
      >
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {format(date, 'EEE', { locale })}
        </div>
        <div className="flex items-center justify-center mt-0.5">
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
        className="flex-1 p-1 space-y-0.5 overflow-y-auto cursor-pointer min-h-[120px]"
        onClick={() => onAddTask(dateKey)}
      >
        {tasks.map(task => (
          <div
            key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
            onClick={e => e.stopPropagation()}
          >
            <CalendarTaskChip task={task} onSelect={() => onSelectTask(task)} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface WeekViewProps {
  days: Date[];
  tasksByDate: Map<string, TaskResponse[]>;
  locale: Locale;
  onSelectTask: (task: TaskResponse) => void;
  onAddTask: (dateKey: string) => void;
}

export function WeekView({ days, tasksByDate, locale, onSelectTask, onAddTask }: WeekViewProps) {
  return (
    <div
      className="flex-1 grid min-h-0 overflow-y-auto"
      style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
    >
      {days.map(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        return (
          <WeekDayColumn
            key={dateKey}
            date={day}
            dateKey={dateKey}
            tasks={tasksByDate.get(dateKey) ?? []}
            locale={locale}
            onSelectTask={onSelectTask}
            onAddTask={onAddTask}
          />
        );
      })}
    </div>
  );
}
