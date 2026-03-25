import { useState, useEffect } from 'react';
import { X, Trash2, Plus, Check, Calendar, Flag, UserPlus } from 'lucide-react';
import type { TaskResponse } from '../../types/api';
import { updateTask, deleteTask, createSubtask, updateSubtask, deleteSubtask, setRecurrence, removeRecurrence } from '../../api/tasks';
import { getProjectMembers } from '../../api/projects';
import type { ProjectMember } from '../../api/projects';
import { PRIORITIES } from '../../lib/priorities';
import { RecurrencePicker } from './RecurrencePicker';
import { toast } from 'sonner';

interface TaskDetailPanelProps {
  task: TaskResponse;
  onClose: () => void;
  onUpdate: () => void;
}

export function TaskDetailPanel({ task, onClose, onUpdate }: TaskDetailPanelProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setDueDate(task.dueDate ?? '');
  }, [task]);

  useEffect(() => {
    getProjectMembers(task.projectId).then(setMembers).catch(() => {});
  }, [task.projectId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateTask(task.id, {
        title: title !== task.title ? title : undefined,
        description: description !== task.description ? description : undefined,
        priority: priority !== task.priority ? priority : undefined,
        dueDate: dueDate !== (task.dueDate ?? '') ? (dueDate || undefined) : undefined,
      });
      onUpdate();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return;
    try {
      await deleteTask(task.id);
      onUpdate();
      onClose();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    try {
      await createSubtask(task.id, newSubtask.trim());
      setNewSubtask('');
      onUpdate();
    } catch {
      toast.error('Failed to add subtask');
    }
  };

  const handleToggleSubtask = async (subtaskId: string, isCompleted: boolean) => {
    try {
      await updateSubtask(subtaskId, { isCompleted: !isCompleted });
      onUpdate();
    } catch {
      toast.error('Failed to update subtask');
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    try {
      await deleteSubtask(subtaskId);
      onUpdate();
    } catch {
      toast.error('Failed to delete subtask');
    }
  };

  const handleAssign = async (userId: string | null) => {
    try {
      await updateTask(task.id, { assignedToId: userId ?? undefined });
      onUpdate();
    } catch {
      toast.error('Failed to assign task');
    }
  };

  // Save on blur for title/description
  const handleBlur = () => {
    if (title !== task.title || description !== task.description || priority !== task.priority || dueDate !== (task.dueDate ?? '')) {
      handleSave();
    }
  };

  return (
    <div className="fixed inset-0 z-50 md:static md:z-auto md:w-96 md:border-l md:border-gray-200 md:dark:border-gray-700">
      {/* Mobile overlay */}
      <div className="absolute inset-0 bg-black/50 md:hidden" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md md:max-w-none md:static bg-white dark:bg-gray-900 flex flex-col shadow-xl md:shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: task.projectColor + '20', color: task.projectColor }}>
            {task.projectName}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={handleDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleBlur}
            className="w-full text-lg font-medium text-gray-900 dark:text-white bg-transparent border-none outline-none"
            placeholder="Task title"
          />

          {/* Due Date & Priority row */}
          <div className="flex gap-3">
            <div className="flex items-center gap-2 flex-1">
              <Calendar size={16} className="text-gray-400" />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); }}
                onBlur={handleBlur}
                className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300 flex-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Flag size={16} className="text-gray-400" />
              <select
                value={priority}
                onChange={(e) => { setPriority(Number(e.target.value)); setTimeout(handleBlur, 0); }}
                className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300"
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Recurrence */}
          <RecurrencePicker
            currentRrule={task.rrule}
            onSet={async (rrule) => {
              try {
                await setRecurrence(task.id, rrule);
                onUpdate();
              } catch { toast.error('Failed to set recurrence'); }
            }}
            onRemove={async () => {
              try {
                await removeRecurrence(task.id);
                onUpdate();
              } catch { toast.error('Failed to remove recurrence'); }
            }}
          />

          {/* Assignment */}
          {members.length > 1 && (
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-gray-400" />
              <select
                value={task.assignedToId ?? ''}
                onChange={(e) => handleAssign(e.target.value || null)}
                className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300 flex-1"
              >
                <option value="">Unassigned</option>
                {members.map(m => (
                  <option key={m.userId} value={m.userId}>{m.displayName}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map(tag => (
                <span key={tag.id} className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: tag.color + '20', color: tag.color }}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleBlur}
            placeholder="Add description..."
            rows={4}
            className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border border-gray-200 dark:border-gray-700 rounded-md p-2 outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          />

          {/* Subtasks */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subtasks</h4>
            <div className="space-y-1">
              {task.subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => handleToggleSubtask(sub.id, sub.isCompleted)}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      sub.isCompleted
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    {sub.isCompleted && <Check size={10} strokeWidth={3} />}
                  </button>
                  <span className={`text-sm flex-1 ${sub.isCompleted ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {sub.title}
                  </span>
                  <button
                    onClick={() => handleDeleteSubtask(sub.id)}
                    className="p-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddSubtask} className="flex items-center gap-2 mt-2">
              <Plus size={14} className="text-gray-400 flex-shrink-0" />
              <input
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add subtask..."
                className="flex-1 text-sm bg-transparent text-gray-700 dark:text-gray-300 outline-none"
              />
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
          {saving ? 'Saving...' : `Created by ${task.createdByName}`}
        </div>
      </div>
    </div>
  );
}
