import { useState, useEffect, useRef, useCallback } from 'react';
import { format, addDays, isToday, isPast, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import { Repeat } from 'lucide-react';
import { getCalendarTasks } from '../../api/calendar';
import type { TaskResponse } from '../../types/api';
import { toast } from 'sonner';

interface AgendaViewProps {
  selectedProjectIds: Set<string>;
  onSelectTask: (task: TaskResponse) => void;
  onAddTask: (dateKey: string) => void;
  todayTrigger: number;
  locale: Locale;
}

const INITIAL_DAYS = 60;
const MORE_DAYS = 30;

export function AgendaView({ selectedProjectIds, onSelectTask, onAddTask, todayTrigger, locale }: AgendaViewProps) {
  const today = useRef(new Date()).current;
  const windowStartRef = useRef(today);
  const windowEndRef = useRef(addDays(today, INITIAL_DAYS));

  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const dateHeaderRefs = useRef<Map<string, HTMLElement>>(new Map());

  const mergeTasksIn = useCallback((incoming: TaskResponse[]) => {
    setTasks(prev => {
      const existing = new Set(prev.map(t => `${t.id}_${t.occurrenceDate ?? 'single'}`));
      const newOnes = incoming.filter(t => !existing.has(`${t.id}_${t.occurrenceDate ?? 'single'}`));
      return [...prev, ...newOnes];
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCalendarTasks(
      format(windowStartRef.current, 'yyyy-MM-dd'),
      format(windowEndRef.current, 'yyyy-MM-dd'),
    ).then(data => {
      if (!cancelled) {
        setTasks(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        toast.error('Failed to load agenda');
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const newStart = addDays(windowEndRef.current, 1);
    const newEnd = addDays(windowEndRef.current, MORE_DAYS);
    windowEndRef.current = newEnd;
    try {
      const data = await getCalendarTasks(
        format(newStart, 'yyyy-MM-dd'),
        format(newEnd, 'yyyy-MM-dd'),
      );
      mergeTasksIn(data);
    } catch {
      toast.error('Failed to load more tasks');
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, mergeTasksIn]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Scroll to today when todayTrigger changes
  useEffect(() => {
    if (todayTrigger === 0) return;
    const todayKey = format(today, 'yyyy-MM-dd');
    const el = dateHeaderRefs.current.get(todayKey);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Scroll to the nearest future date if today has no tasks
    const refs = dateHeaderRefs.current;
    const keys = [...refs.keys()].sort();
    const nearest = keys.find(k => k >= todayKey);
    if (nearest) refs.get(nearest)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [todayTrigger, today]);

  const filteredTasks = selectedProjectIds.size === 0
    ? tasks
    : tasks.filter(t => selectedProjectIds.has(t.projectId));

  // Group by date
  const grouped: { dateKey: string; date: Date; tasks: TaskResponse[] }[] = [];
  const byDate = new Map<string, TaskResponse[]>();
  for (const task of filteredTasks) {
    if (!task.dueDate) continue;
    if (!byDate.has(task.dueDate)) byDate.set(task.dueDate, []);
    byDate.get(task.dueDate)!.push(task);
  }
  const sortedKeys = [...byDate.keys()].sort();
  for (const key of sortedKeys) {
    grouped.push({ dateKey: key, date: parseISO(key), tasks: byDate.get(key)! });
  }

  // Sort tasks within each group by time
  for (const group of grouped) {
    group.tasks.sort((a, b) => {
      if (!a.dueDateTime && !b.dueDateTime) return 0;
      if (!a.dueDateTime) return 1;
      if (!b.dueDateTime) return -1;
      return new Date(a.dueDateTime).getTime() - new Date(b.dueDateTime).getTime();
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-24 text-gray-400 dark:text-gray-500 text-sm">
        No upcoming tasks
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-4 space-y-6">
        {grouped.map(({ dateKey, date, tasks: dateTasks }) => {
          const isDateToday = isToday(date);
          const isDatePast = !isDateToday && isPast(date);

          return (
            <div
              key={dateKey}
              ref={el => {
                if (el) dateHeaderRefs.current.set(dateKey, el);
                else dateHeaderRefs.current.delete(dateKey);
              }}
            >
              {/* Date header */}
              <div className="flex items-center gap-3 mb-2">
                <div className={`text-sm font-semibold ${
                  isDateToday
                    ? 'text-blue-600 dark:text-blue-400'
                    : isDatePast
                      ? 'text-gray-400 dark:text-gray-500'
                      : 'text-gray-700 dark:text-gray-300'
                }`}>
                  {isDateToday
                    ? `Today — ${format(date, 'EEEE, MMMM d', { locale })}`
                    : format(date, 'EEEE, MMMM d', { locale })}
                </div>
                <div className={`flex-1 h-px ${isDateToday ? 'bg-blue-200 dark:bg-blue-800' : 'bg-gray-100 dark:bg-gray-800'}`} />
              </div>

              {/* Tasks */}
              <div className="space-y-1">
                {dateTasks.map(task => (
                  <div
                    key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
                    onClick={() => onSelectTask(task)}
                    className="flex items-center gap-3 cursor-pointer group rounded-md px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    {/* Time */}
                    <div className="w-11 shrink-0 text-right text-xs font-mono text-gray-400 dark:text-gray-500">
                      {task.dueDateTime
                        ? format(new Date(task.dueDateTime), 'p', { locale })
                        : <span className="opacity-30">—</span>}
                    </div>

                    {/* Task chip */}
                    <div
                      className={`flex-1 min-w-0 text-xs px-2 py-1 rounded flex items-center gap-1.5 ${
                        task.completedAt ? 'line-through opacity-50' : ''
                      }`}
                      style={{
                        backgroundColor: task.projectColor + '18',
                        color: task.projectColor,
                        borderLeft: `2px solid ${task.projectColor}`,
                      }}
                    >
                      <span className="truncate flex-1">{task.title}</span>
                    </div>

                    {/* Recurring indicator */}
                    {task.rrule && (
                      <Repeat
                        size={12}
                        className="shrink-0 text-gray-400 dark:text-gray-500"
                      />
                    )}
                  </div>
                ))}

                {/* Add task */}
                <button
                  onClick={() => onAddTask(dateKey)}
                  className="ml-14 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-0.5"
                >
                  + Add task
                </button>
              </div>
            </div>
          );
        })}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          </div>
        )}
      </div>
    </div>
  );
}
