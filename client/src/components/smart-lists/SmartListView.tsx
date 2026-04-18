import { useState, useEffect, useCallback, useRef } from 'react';
import { getSmartList, createTask, completeTask, uncompleteTask, completeOccurrence, uncompleteOccurrence } from '../../api/tasks';
import { listProjects } from '../../api/projects';
import type { TaskResponse } from '../../types/api';
import { TaskItem } from '../tasks/TaskItem';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { AddTaskInput } from '../tasks/AddTaskInput';
import { groupByDate } from '../../lib/dates';
import { format, addDays, parseISO } from 'date-fns';
import { useLocale } from '../../contexts/LocaleContext';
import { useSignalR } from '../../hooks/useSignalR';
import { TaskListSkeleton } from '../shared/TaskListSkeleton';
import { toast } from 'sonner';
import { PRIORITIES, getPriority } from '../../lib/priorities';
import { ChevronDown, Check, Flag } from 'lucide-react';

type SmartListType = 'today' | 'tomorrow' | 'next7days' | 'all' | 'assigned-to-me' | 'priority';

interface SmartListViewProps {
  type: SmartListType;
  title: string;
}

export function SmartListView({ type, title }: SmartListViewProps) {
  const { locale } = useLocale();
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [inboxProjectId, setInboxProjectId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const selectedTaskRef = useRef(selectedTask);
  selectedTaskRef.current = selectedTask;
  const [loading, setLoading] = useState(true);
  const [showPriorityFilter, setShowPriorityFilter] = useState(false);
  const [selectedPriorities, setSelectedPriorities] = useState<Set<number>>(() => {
    if (type !== 'priority') return new Set();
    try {
      const saved = localStorage.getItem('smartlist-priority-filter');
      if (saved) return new Set(JSON.parse(saved) as number[]);
    } catch { /* ignore */ }
    return new Set();
  });

  const fetchData = useCallback(async () => {
    try {
      const data = await getSmartList(type);
      setTasks(data);
      if (selectedTaskRef.current) {
        const sel = selectedTaskRef.current;
        const updated = data.find(t => t.id === sel.id && t.occurrenceDate === sel.occurrenceDate);
        if (updated) {
          setSelectedTask(updated);
        } else {
          // Recurrence may have been added or removed, shifting occurrenceDate;
          // keep the dialog open on the nearest matching task by id.
          const anyMatch = data.find(t => t.id === sel.id);
          setSelectedTask(anyMatch ?? null);
        }
      }
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useSignalR(fetchData);

  useEffect(() => {
    listProjects()
      .then(projects => {
        const inbox = projects.find(p => p.isInbox);
        if (inbox) setInboxProjectId(inbox.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedTask(null);
    fetchData();
  }, [type]);

  const handleAdd = async (title: string, dueDate?: string, dueDateTime?: string) => {
    if (!inboxProjectId) return;
    try {
      let resolvedDueDate = dueDate;
      let resolvedDueDateTime = dueDateTime;
      if (!resolvedDueDate) {
        if (type === 'today' || type === 'next7days') resolvedDueDate = format(new Date(), 'yyyy-MM-dd');
        else if (type === 'tomorrow') resolvedDueDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
        // When only a time was parsed (no explicit date), rebase dueDateTime onto the
        // smart-list date instead of the default "today" that parseNaturalDate used.
        if (resolvedDueDateTime && resolvedDueDate) {
          const t = new Date(resolvedDueDateTime);
          const base = parseISO(resolvedDueDate);
          resolvedDueDateTime = new Date(
            base.getFullYear(), base.getMonth(), base.getDate(),
            t.getHours(), t.getMinutes()
          ).toISOString();
        }
      }
      await createTask(inboxProjectId, { title, dueDate: resolvedDueDate, dueDateTime: resolvedDueDateTime });
      await fetchData();
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleToggleComplete = async (task: TaskResponse) => {
    try {
      if (task.occurrenceDate) {
        // Virtual recurring instance
        if (task.completedAt) {
          await uncompleteOccurrence(task.id, task.occurrenceDate);
        } else {
          await completeOccurrence(task.id, task.occurrenceDate);
          toast('Task completed', {
            duration: 5000,
            action: {
              label: 'Undo',
              onClick: async () => {
                await uncompleteOccurrence(task.id, task.occurrenceDate!);
                await fetchData();
              },
            },
          });
        }
      } else {
        if (task.completedAt) {
          await uncompleteTask(task.id);
        } else {
          await completeTask(task.id);
          toast('Task completed', {
            duration: 5000,
            action: {
              label: 'Undo',
              onClick: async () => {
                await uncompleteTask(task.id);
                await fetchData();
              },
            },
          });
        }
      }
      await fetchData();
    } catch {
      toast.error('Failed to update task');
    }
  };

  const togglePriorityFilter = (value: number) => {
    setSelectedPriorities(prev => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      localStorage.setItem('smartlist-priority-filter', JSON.stringify([...next]));
      return next;
    });
  };

  const clearPriorityFilter = () => {
    setSelectedPriorities(new Set());
    localStorage.removeItem('smartlist-priority-filter');
  };

  const displayedTasks = type === 'priority' && selectedPriorities.size > 0
    ? tasks.filter(t => selectedPriorities.has(t.priority))
    : tasks;

  // Group tasks for next7days by date, for all by project, for priority by priority level
  const groupTasks = (): Map<string, TaskResponse[]> => {
    const groups = new Map<string, TaskResponse[]>();

    if (type === 'next7days') {
      for (const task of displayedTasks) {
        const key = task.dueDate ? groupByDate(task.dueDate, locale) : 'No date';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
      }
    } else if (type === 'all') {
      for (const task of displayedTasks) {
        const key = task.projectName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
      }
    } else if (type === 'priority') {
      // Insert groups in High→Medium→Low→None order so they always appear in that order
      const priorityOrder = [3, 2, 1];
      for (const pv of priorityOrder) {
        const label = getPriority(pv).label;
        const matching = displayedTasks.filter(t => t.priority === pv);
        if (matching.length > 0) groups.set(label, matching);
      }
    } else if (type === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const overdue: TaskResponse[] = [];
      const todayTasks: TaskResponse[] = [];
      for (const task of displayedTasks) {
        if (task.dueDate && parseISO(task.dueDate) < todayStart) {
          overdue.push(task);
        } else {
          todayTasks.push(task);
        }
      }
      if (overdue.length) groups.set('Overdue', overdue);
      if (todayTasks.length) groups.set('Today', todayTasks);
    } else {
      groups.set('', displayedTasks);
    }

    return groups;
  };

  const groups = groupTasks();
  const showProject = type !== 'all'; // already grouped by project in 'all' view

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">{displayedTasks.length} task{displayedTasks.length !== 1 ? 's' : ''}</p>
            </div>
            {type === 'priority' && (
              <div className="relative shrink-0 mt-1">
                <button
                  onClick={() => setShowPriorityFilter(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors font-medium ${
                    selectedPriorities.size > 0
                      ? 'border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                      : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <Flag size={14} />
                  {selectedPriorities.size === 0
                    ? 'All priorities'
                    : selectedPriorities.size === 1
                      ? (PRIORITIES.find(p => selectedPriorities.has(p.value))?.label ?? '1 priority')
                      : `${selectedPriorities.size} priorities`}
                  <ChevronDown size={14} className="text-gray-400" />
                </button>
                {showPriorityFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPriorityFilter(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px]">
                      <button
                        onClick={clearPriorityFilter}
                        className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between gap-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                          selectedPriorities.size === 0
                            ? 'text-blue-600 dark:text-blue-400 font-medium'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        All priorities
                        {selectedPriorities.size === 0 && <Check size={14} />}
                      </button>
                      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
                      {[...PRIORITIES].filter(p => p.value > 0).reverse().map(p => {
                        const isSelected = selectedPriorities.has(p.value);
                        return (
                          <button
                            key={p.value}
                            onClick={() => togglePriorityFilter(p.value)}
                            className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                          >
                            <Flag size={14} className={p.color} />
                            <span className="flex-1">{p.label}</span>
                            {isSelected && <Check size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {inboxProjectId && <AddTaskInput onAdd={handleAdd} />}

        <div className="flex-1 overflow-y-auto">
          {loading && displayedTasks.length === 0 ? (
            <TaskListSkeleton />
          ) : displayedTasks.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No tasks</p>
              <p className="text-sm mt-1">Nothing to show here</p>
            </div>
          ) : (
            Array.from(groups.entries()).map(([groupName, groupTasks]) => (
              <div key={groupName}>
                {groupName && (
                  <div className={`px-4 py-2 border-b ${groupName === 'Overdue' ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-800'}`}>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${groupName === 'Overdue' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {groupName}
                    </span>
                  </div>
                )}
                {groupTasks.map((task) => (
                  <TaskItem
                    key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onSelect={setSelectedTask}
                    isSelected={selectedTask?.id === task.id && selectedTask?.occurrenceDate === task.occurrenceDate}
                    showProject={showProject}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={fetchData}
          onToggleComplete={handleToggleComplete}
        />
      )}
    </div>
  );
}
