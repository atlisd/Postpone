import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router';
import { listTasks, createTask, completeTask, uncompleteTask } from '../../api/tasks';
import { getProject } from '../../api/projects';
import type { TaskResponse, ProjectResponse } from '../../types/api';
import { TaskItem } from '../tasks/TaskItem';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { AddTaskInput } from '../tasks/AddTaskInput';
import { useSignalR } from '../../hooks/useSignalR';
import { TaskListSkeleton } from '../shared/TaskListSkeleton';
import { toast } from 'sonner';

export function ProjectTaskList() {
  const { id: projectId } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [p, t] = await Promise.all([
        getProject(projectId),
        listTasks(projectId, showCompleted),
      ]);
      setProject(p);
      setTasks(t);

      // Refresh selected task if still open
      if (selectedTask) {
        const updated = t.find(task => task.id === selectedTask.id);
        if (updated) setSelectedTask(updated);
        else setSelectedTask(null);
      }
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId, showCompleted]);

  useSignalR(fetchData);

  useEffect(() => {
    setSelectedTask(null);
    fetchData();
  }, [projectId, showCompleted]);

  const handleAdd = async (title: string) => {
    if (!projectId) return;
    try {
      await createTask(projectId, { title });
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

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project?.color }} />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{project?.name}</h2>
            </div>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {showCompleted ? 'Hide completed' : 'Show completed'}
            </button>
          </div>
        </div>

        {/* Add task */}
        <AddTaskInput onAdd={handleAdd} />

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {loading && tasks.length === 0 ? (
            <TaskListSkeleton />
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No tasks yet</p>
              <p className="text-sm mt-1">Add your first task above</p>
            </div>
          ) : (
            tasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
                onSelect={setSelectedTask}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
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
