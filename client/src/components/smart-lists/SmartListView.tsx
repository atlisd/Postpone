import { useState, useEffect, useCallback } from 'react';
import { getSmartList, completeTask, uncompleteTask } from '../../api/tasks';
import type { TaskResponse } from '../../types/api';
import { TaskItem } from '../tasks/TaskItem';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { groupByDate } from '../../lib/dates';
import { useSignalR } from '../../hooks/useSignalR';
import { TaskListSkeleton } from '../shared/TaskListSkeleton';
import { toast } from 'sonner';

type SmartListType = 'today' | 'tomorrow' | 'next7days' | 'all' | 'assigned-to-me';

interface SmartListViewProps {
  type: SmartListType;
  title: string;
}

export function SmartListView({ type, title }: SmartListViewProps) {
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const data = await getSmartList(type);
      setTasks(data);
      if (selectedTask) {
        const updated = data.find(t => t.id === selectedTask.id);
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
    setSelectedTask(null);
    fetchData();
  }, [type]);

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
        const key = task.dueDate ? groupByDate(task.dueDate) : 'No date';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
      }
    } else if (type === 'all') {
      for (const task of tasks) {
        const key = task.projectName;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
      }
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
                  <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {groupName}
                    </span>
                  </div>
                )}
                {groupTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onToggleComplete={handleToggleComplete}
                    onSelect={setSelectedTask}
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
        />
      )}
    </div>
  );
}
