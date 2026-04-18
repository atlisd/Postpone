import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { listTasks, createTask, completeTask, uncompleteTask, completeOccurrence, uncompleteOccurrence, reorderTasks } from '../../api/tasks';
import { useDndMonitor, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
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
        const updated = t.find(task =>
          task.id === selectedTaskRef.current!.id
          && task.occurrenceDate === selectedTaskRef.current!.occurrenceDate
        );
        if (updated) {
          setSelectedTask(updated);
        } else {
          // Recurrence may have been added or removed, shifting occurrenceDate;
          // keep the dialog open on the nearest matching task by id.
          const anyMatch = t.find(task => task.id === selectedTaskRef.current!.id);
          setSelectedTask(anyMatch ?? null);
        }
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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (active.data.current?.type !== 'task-item') return;
    if (over.data.current?.type !== 'task-item') return;

    const itemId = (t: TaskResponse) => `${t.id}_${t.occurrenceDate ?? 'single'}`;
    const oldIndex = tasksRef.current.findIndex(t => itemId(t) === active.id);
    const newIndex = tasksRef.current.findIndex(t => itemId(t) === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    const reordered = arrayMove(tasksRef.current, oldIndex, newIndex);
    fetchVersionRef.current++;
    setTasks(reordered);

    reorderTasks(projectId!, reordered.map(t => t.id)).catch(() => {
      toast.error('Failed to save order');
      fetchData();
    });
  }, [projectId, fetchData]);

  useDndMonitor({ onDragEnd: handleDragEnd });

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
      if (task.occurrenceDate) {
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
            <SortableContext
              items={tasks.map(t => `${t.id}_${t.occurrenceDate ?? 'single'}`)}
              strategy={verticalListSortingStrategy}
            >
              {tasks.map(task => (
                <TaskItem
                  key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
                  task={task}
                  onToggleComplete={handleToggleComplete}
                  onSelect={setSelectedTask}
                  isSelected={selectedTask?.id === task.id && selectedTask?.occurrenceDate === task.occurrenceDate}
                />
              ))}
            </SortableContext>
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
