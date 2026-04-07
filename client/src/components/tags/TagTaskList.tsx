import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { getTagTasks, listTags } from '../../api/tags';
import { completeTask, uncompleteTask, completeOccurrence, uncompleteOccurrence } from '../../api/tasks';
import type { TaskResponse, TagFull } from '../../types/api';
import { TaskItem } from '../tasks/TaskItem';
import { TaskDetailPanel } from '../tasks/TaskDetailPanel';
import { useSignalR } from '../../hooks/useSignalR';
import { TaskListSkeleton } from '../shared/TaskListSkeleton';
import { toast } from 'sonner';

export function TagTaskList() {
  const { id: tagId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tag, setTag] = useState<TagFull | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskResponse | null>(null);
  const selectedTaskRef = useRef(selectedTask);
  selectedTaskRef.current = selectedTask;
  const [loading, setLoading] = useState(true);
  const fetchVersionRef = useRef(0);

  const fetchData = useCallback(async () => {
    if (!tagId) return;
    const version = ++fetchVersionRef.current;
    try {
      const [tags, t] = await Promise.all([
        listTags(),
        getTagTasks(tagId),
      ]);
      if (fetchVersionRef.current !== version) return;
      const found = tags.find(tg => tg.id === tagId);
      if (!found) { navigate('/app/today', { replace: true }); return; }
      setTag(found);
      setTasks(t);
      if (selectedTaskRef.current) {
        const updated = t.find(task =>
          task.id === selectedTaskRef.current!.id
          && task.occurrenceDate === selectedTaskRef.current!.occurrenceDate
        );
        if (updated) setSelectedTask(updated);
        else setSelectedTask(null);
      }
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [tagId, navigate]);

  useSignalR(fetchData);

  useEffect(() => {
    setSelectedTask(null);
    fetchData();
  }, [tagId]);

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
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag?.color }} />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{tag?.name ?? ''}</h2>
          </div>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {loading && tasks.length === 0 ? (
            <TaskListSkeleton />
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <p className="text-lg">No tasks with this tag</p>
            </div>
          ) : (
            tasks.map((task, index) => (
              <TaskItem
                key={`${task.id}_${task.occurrenceDate ?? 'single'}`}
                task={task}
                onToggleComplete={handleToggleComplete}
                onSelect={setSelectedTask}
                isSelected={selectedTask?.id === task.id && selectedTask?.occurrenceDate === task.occurrenceDate}
                index={index}
                showProject
              />
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
