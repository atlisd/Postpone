import { useState, useEffect, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, addMonths, subMonths, isSameMonth, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getCalendarTasks } from '../../api/calendar';
import { updateTaskDueDate } from '../../api/tasks';
import type { TaskResponse } from '../../types/api';
import { CalendarDayCell } from './CalendarDayCell';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { DragDropProvider } from '@dnd-kit/react';
import { toast } from 'sonner';

export function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    try {
      const data = await getCalendarTasks(
        format(calStart, 'yyyy-MM-dd'),
        format(calEnd, 'yyyy-MM-dd')
      );
      setTasks(data);
    } catch {
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    setLoading(true);
    fetchTasks();
  }, [fetchTasks]);

  const handleDragEnd = async (event: { operation: { source?: { id?: string | number } | null; target?: { id?: string | number } | null } }) => {
    const { source, target } = event.operation;
    if (!source?.id || !target?.id) return;

    const taskId = String(source.id);
    const newDate = String(target.id); // date string from droppable

    try {
      await updateTaskDueDate(taskId, newDate);
      await fetchTasks();
    } catch {
      toast.error('Failed to reschedule task');
    }
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  // Group tasks by date
  const tasksByDate = new Map<string, TaskResponse[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const key = task.dueDate;
    if (!tasksByDate.has(key)) tasksByDate.set(key, []);
    tasksByDate.get(key)!.push(task);
  }

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {format(currentMonth, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-3 py-1 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              Today
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : (
          <DragDropProvider onDragEnd={handleDragEnd}>
            <div className="flex-1 flex flex-col">
              {/* Weekday headers */}
              <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
                {weekDays.map(day => (
                  <div key={day} className="px-2 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 text-center uppercase">
                    {day}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="flex-1 grid grid-cols-7 auto-rows-fr">
                {days.map(day => {
                  const dateKey = format(day, 'yyyy-MM-dd');
                  const dayTasks = tasksByDate.get(dateKey) ?? [];

                  return (
                    <CalendarDayCell
                      key={dateKey}
                      date={day}
                      dateKey={dateKey}
                      tasks={dayTasks}
                      isCurrentMonth={isSameMonth(day, currentMonth)}
                      isToday={isToday(day)}
                      onSelectTask={setSelectedTask}
                    />
                  );
                })}
              </div>
            </div>
          </DragDropProvider>
        )}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={fetchTasks}
        />
      )}
    </div>
  );
}
