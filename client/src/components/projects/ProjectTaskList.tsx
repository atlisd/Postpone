import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { listTasks, createTask, completeTask, uncompleteTask, reorderTasks } from '../../api/tasks';
import { useDragDropMonitor } from '@dnd-kit/react';
import { isSortableOperation } from '@dnd-kit/react/sortable';
import { getProject } from '../../api/projects';
import type { TaskResponse, ProjectResponse } from '../../types/api';
import { TaskItem } from '../tasks/TaskItem';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { AddTaskInput } from '../tasks/AddTaskInput';
import { useSignalR } from '../../hooks/useSignalR';
import { TaskListSkeleton } from '../shared/TaskListSkeleton';
import { HTTPError } from 'ky';
import { toast } from 'sonner';

export function ProjectTaskList() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const selectedTaskRef = useRef(selectedTask);
  selectedTaskRef.current = selectedTask;
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchVersionRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    const version = ++fetchVersionRef.current;
    try {
      const [p, t] = await Promise.all([
        getProject(projectId),
        listTasks(projectId, showCompleted),
      ]);
      if (fetchVersionRef.current !== version) return;
      setProject(p);
      setTasks(t);

      // Refresh selected task if still open
      if (selectedTaskRef.current) {
        const updated = t.find(task => task.id === selectedTaskRef.current!.id);
        if (updated) setSelectedTask(updated);
        else setSelectedTask(null);
      }
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 404) {
        navigate('/app/today', { replace: true });
        return;
      }
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId, showCompleted]);

  useSignalR(fetchData);

  useDragDropMonitor({
    onDragEnd(event) {
      const { operation } = event;
      if (!isSortableOperation(operation)) return;
      const { source, target } = operation;
      if (!source || !target) return;
      if (source.group !== target.group || source.group !== projectId) return;
      const fromIndex = source.initialIndex;
      const toIndex = source.index;
      if (fromIndex === toIndex) return;

      const reordered = [...tasks];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      fetchVersionRef.current++;
      setTasks(reordered);

      reorderTasks(projectId!, reordered.map(t => t.id)).catch(() => {
        toast.error('Failed to save order');
        fetchData();
      });
    }
  });

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
            tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggleComplete={handleToggleComplete}
                onSelect={setSelectedTask}
                index={index}
                group={projectId}
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
