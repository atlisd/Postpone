import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import type { TaskResponse } from '../../types/api';
import { WeekDayColumn } from './WeekView';

interface TwoWeekViewProps {
  days: Date[];
  tasksByDate: Map<string, TaskResponse[]>;
  locale: Locale;
  highlightedRange: { start: string; end: string } | null;
  onSelectTask: (task: TaskResponse) => void;
  onCellMouseDown: (dateKey: string) => void;
  onCellMouseEnter: (dateKey: string) => void;
  onCellMouseUp: (dateKey: string) => void;
}

export function TwoWeekView({ days, tasksByDate, locale, highlightedRange, onSelectTask, onCellMouseDown, onCellMouseEnter, onCellMouseUp }: TwoWeekViewProps) {
  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);

  function renderRow(weekDays: Date[], className: string) {
    return (
      <div
        className={`flex-1 grid min-h-0 ${className}`}
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {weekDays.map(day => {
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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {renderRow(week1, 'border-b border-gray-200 dark:border-gray-700')}
      {renderRow(week2, '')}
    </div>
  );
}
