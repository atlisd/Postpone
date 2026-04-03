import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
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
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<ProjectResponse | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const selectedTaskRef = useRef(selectedTask);
  selectedTaskRef.current = selectedTask;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
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

  // Tracks the accumulating intended order during a task drag — same fix as
  // sidebar project reordering. OptimisticSortingPlugin moves the dragged item's
  // droppable to the pointer position after each visual swap, so collision
  // detection sees target.id === source.id by dragend time. We build the final
  // order incrementally from onDragOver events instead.
  const runningTaskOrderRef = useRef<TaskResponse[] | null>(null);

  useDragDropMonitor({
    onDragOver(event) {
      const { operation } = event;
      if (!isSortableOperation(operation)) return;
      const { source, target } = operation;
      if (!source || !target) return;
      if (source.group !== projectId || target.group !== projectId) return;
      const sourceId = String(source.id);
      const targetId = String(target.id);
      if (sourceId === targetId) return;
      const base = runningTaskOrderRef.current ?? tasksRef.current;
      const itemId = (t: TaskResponse) => `${t.id}_${t.occurrenceDate ?? 'single'}`;
      const fromIndex = base.findIndex(t => itemId(t) === sourceId);
      const toIndex = base.findIndex(t => itemId(t) === targetId);
      if (fromIndex === -1 || toIndex === -1) return;
      const reordered = [...base];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      runningTaskOrderRef.current = reordered;
    },
    onDragEnd(event) {
      const intended = runningTaskOrderRef.current;
      runningTaskOrderRef.current = null;
      if (!intended) return;

      const { operation } = event;
      if (!isSortableOperation(operation)) return;
      const { source } = operation;
      if (!source || source.group !== projectId) return;

      const sourceId = String(source.id);
      const itemId = (t: TaskResponse) => `${t.id}_${t.occurrenceDate ?? 'single'}`;
      const originalPos = tasksRef.current.findIndex(t => itemId(t) === sourceId);
      const intendedPos = intended.findIndex(t => itemId(t) === sourceId);
      if (originalPos === -1 || intendedPos === -1 || originalPos === intendedPos) return;

      fetchVersionRef.current++;
      setTasks(intended);

      reorderTasks(projectId!, intended.map(t => t.id)).catch(() => {
        toast.error('Failed to save order');
        fetchData();
      });
    }
  });

  useEffect(() => {
    setSelectedTask(null);
    fetchData();
  }, [projectId, showCompleted]);

  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || tasks.length === 0) return;
    const occurrence = searchParams.get('occurrence');
    const match = tasks.find(t =>
      t.id === taskId && (occurrence ? t.occurrenceDate === occurrence : true)
    );
    if (match) setSelectedTask(match);
  }, [tasks, searchParams]);

  const handleAdd = async (title: string, dueDate?: string, dueDateTime?: string) => {
    if (!projectId) return;
    try {
      await createTask(projectId, { title, dueDate, dueDateTime });
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
                isSelected={selectedTask?.id === task.id}
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
          onToggleComplete={handleToggleComplete}
        />
      )}
    </div>
  );
}
