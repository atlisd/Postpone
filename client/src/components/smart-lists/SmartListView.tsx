import { useState, useEffect, useCallback, useRef } from 'react';
import { getSmartList, createTask, completeTask, uncompleteTask } from '../../api/tasks';
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

type SmartListType = 'today' | 'tomorrow' | 'next7days' | 'all' | 'assigned-to-me';

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

  const fetchData = useCallback(async () => {
    try {
      const data = await getSmartList(type);
      setTasks(data);
      if (selectedTaskRef.current) {
        const updated = data.find(t => t.id === selectedTaskRef.current!.id);
        if (updated) setSelectedTask(updated);
        else setSelectedTask(null);
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
      if (!resolvedDueDate) {
        if (type === 'today' || type === 'next7days') resolvedDueDate = format(new Date(), 'yyyy-MM-dd');
        else if (type === 'tomorrow') resolvedDueDate = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      }
      await createTask(inboxProjectId, { title, dueDate: resolvedDueDate, dueDateTime });
      await fetchData();
    } catch {
      toast.error('Failed to create task');
    }
  };

  const handleToggleComplete = async (task: TaskResponse) => {
    try {
      if (task.completedAt) {
        await uncompleteTask(task.id);
      } else {
        await completeTask(task.id);
      }
      await fetchData();
    } catch {
      toast.error('Failed to update task');
    }
  };

  // Group tasks for next7days by date, for all by project
  const groupTasks = (): Map<string, TaskResponse[]> => {
    const groups = new Map<string, TaskResponse[]>();

    if (type === 'next7days') {
      for (const task of tasks) {
        const key = task.dueDate ? groupByDate(task.dueDate, locale) : 'No date';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
      }
    } else if (type === 'all') {
      for (const task of tasks) {
        const key = task.projectName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
      }
    } else if (type === 'today') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const overdue: TaskResponse[] = [];
      const todayTasks: TaskResponse[] = [];
      for (const task of tasks) {
        if (task.dueDate && parseISO(task.dueDate) < todayStart) {
          overdue.push(task);
        } else {
          todayTasks.push(task);
        }
      }
      if (overdue.length) groups.set('Overdue', overdue);
      if (todayTasks.length) groups.set('Today', todayTasks);
    } else {
      groups.set('', tasks);
    }

    return groups;
  };

  const groups = groupTasks();
  const showProject = type !== 'all'; // already grouped by project in 'all' view

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
        </div>

        {inboxProjectId && <AddTaskInput onAdd={handleAdd} />}

        <div className="flex-1 overflow-y-auto">
          {loading && tasks.length === 0 ? (
            <TaskListSkeleton />
          ) : tasks.length === 0 ? (
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
                {groupTasks.map((task, index) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onSelect={setSelectedTask}
                    isSelected={selectedTask?.id === task.id}
                    showProject={showProject}
                    index={index}
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
        />
      )}
    </div>
  );
}
