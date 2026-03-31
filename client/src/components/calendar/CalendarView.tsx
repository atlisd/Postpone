import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, addMonths, subMonths, addDays, isSameMonth, isToday, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLocale } from '../../contexts/LocaleContext';
import { getCalendarTasks } from '../../api/calendar';
import { parseNaturalDate } from '../../lib/naturalDate';
import { updateTaskDueDate, createTask, rescheduleOccurrence, completeTask, uncompleteTask, completeOccurrence, uncompleteOccurrence } from '../../api/tasks';
import { listProjects } from '../../api/projects';
import type { TaskResponse, ProjectResponse } from '../../types/api';
import { CalendarDayCell } from './CalendarDayCell';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { DragDropProvider } from '@dnd-kit/react';
import { toast } from 'sonner';

export function CalendarView() {
  const { locale } = useLocale();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [addingToDate, setAddingToDate] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    listProjects().then(data => {
      setProjects(data);
      if (data.length > 0) setNewTaskProjectId(data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (addingToDate) {
      setTimeout(() => titleInputRef.current?.focus(), 50);
    }
  }, [addingToDate]);

  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find(
        t => t.id === selectedTask.id && t.occurrenceDate === selectedTask.occurrenceDate
      );
      if (updated) setSelectedTask(updated);
    }
  }, [tasks]);

  const handleToggleComplete = async (task: TaskResponse) => {
    try {
      if (task.occurrenceDate) {
        task.completedAt ? await uncompleteOccurrence(task.id, task.occurrenceDate)
                         : await completeOccurrence(task.id, task.occurrenceDate);
      } else {
        task.completedAt ? await uncompleteTask(task.id) : await completeTask(task.id);
      }
      await fetchTasks();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !newTaskProjectId || !addingToDate) return;
    try {
      const parsed = parseNaturalDate(newTaskTitle.trim());
      const effectiveTitle = parsed ? parsed.cleanTitle || newTaskTitle.trim() : newTaskTitle.trim();
      const effectiveDueDate = parsed ? parsed.dueDate : addingToDate;
      const effectiveDueDateTime = parsed?.dueDateTime;
      await createTask(newTaskProjectId, {
        title: effectiveTitle,
        dueDate: effectiveDueDate,
        dueDateTime: effectiveDueDateTime,
      });
      setAddingToDate(null);
      setNewTaskTitle('');
      await fetchTasks();
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleDragEnd = async (event: { operation: { source?: { id?: string | number } | null; target?: { id?: string | number } | null } }) => {
    const { source, target } = event.operation;
    if (!source?.id || !target?.id) return;

    const dragId = String(source.id);
    const newDate = String(target.id); // date string from droppable

    try {
      // Check if this is a virtual recurring instance (composite key: taskId_occurrenceDate)
      const task = tasks.find(t => `${t.id}_${t.occurrenceDate ?? 'single'}` === dragId);
      if (task?.occurrenceDate) {
        await rescheduleOccurrence(task.id, task.occurrenceDate, newDate);
      } else {
        const taskId = task?.id ?? dragId;
        await updateTaskDueDate(taskId, newDate);
      }
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

  const refMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(refMonday, i), 'EEE', { locale }));

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {format(currentMonth, 'LLLL yyyy', { locale })}
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
                      onAddTask={setAddingToDate}
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
          onToggleComplete={handleToggleComplete}
        />
      )}

      {addingToDate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setAddingToDate(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Add task — {format(parseISO(addingToDate), 'PP', { locale })}
              </h3>
              <button onClick={() => setAddingToDate(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddTask} className="space-y-3">
              <input
                ref={titleInputRef}
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                placeholder="Task title"
                className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-blue-500 dark:focus:border-gray-400"
              />
              {projects.length > 1 && (
                <select
                  value={newTaskProjectId}
                  onChange={e => setNewTaskProjectId(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAddingToDate(null)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                  Cancel
                </button>
                <button type="submit" disabled={!newTaskTitle.trim()} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-medium">
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
