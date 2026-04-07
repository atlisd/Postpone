import { useState, useEffect, useRef, useCallback } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { useLocale } from '../../contexts/LocaleContext';
import { LocaleDateInput } from '../shared/LocaleDateInput';
import { LocaleTimeInput } from '../shared/LocaleTimeInput';

function extractLocalTime(dueDateTimeUtc: string | null): string {
  if (!dueDateTimeUtc) return '';
  const normalized = /[Z+\-]\d*$/.test(dueDateTimeUtc) ? dueDateTimeUtc : dueDateTimeUtc + 'Z';
  const d = new Date(normalized);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
import { X, Trash2, Plus, Check, Flag, UserPlus, FolderOpen, GripVertical, Tag } from 'lucide-react';
import type { TaskResponse, ProjectResponse } from '../../types/api';
import { updateTask, deleteTask, createSubtask, updateSubtask, deleteSubtask, reorderSubtasks, setRecurrence, removeRecurrence, moveTask, skipOccurrence, editOccurrence, addTagToTask, removeTagFromTask } from '../../api/tasks';
import { listTags, createTag } from '../../api/tags';
import type { TagFull } from '../../types/api';
import type { SubtaskResponse } from '../../types/api';
import { getProjectMembers, listProjects } from '../../api/projects';
import type { ProjectMember } from '../../api/projects';
import { PRIORITIES } from '../../lib/priorities';
import { RecurrencePicker } from './RecurrencePicker';
import { RemindersSection } from './RemindersSection';
import { OccurrenceDeleteModal } from './OccurrenceDeleteModal';
import { toast } from 'sonner';

function SortableSubtask({ sub, index, group, onToggle, onDelete }: {
  sub: SubtaskResponse;
  index: number;
  group: string;
  onToggle: (id: string, isCompleted: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const { ref, handleRef, isDragging } = useSortable({ id: sub.id, index, group });
  return (
    <div ref={ref} className={`relative flex items-center gap-2 group ${isDragging ? 'opacity-40' : ''}`}>
      <span
        ref={handleRef}
        className="absolute -left-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical size={12} className="text-gray-300 dark:text-gray-600" />
      </span>
      <button
        onClick={() => onToggle(sub.id, sub.isCompleted)}
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
        onClick={() => onDelete(sub.id)}
        className="p-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function SubtaskDragContainer({ taskId, subtasks, onToggle, onDelete, onUpdate }: {
  taskId: string;
  subtasks: SubtaskResponse[];
  onToggle: (id: string, isCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onUpdate: () => void;
}) {
  const subtaskGroup = taskId + '-subtasks';
  const [localSubtasks, setLocalSubtasks] = useState<SubtaskResponse[]>(subtasks);
  const localSubtasksRef = useRef(localSubtasks);
  localSubtasksRef.current = localSubtasks;

  useEffect(() => {
    setLocalSubtasks(subtasks);
  }, [subtasks]);

  const handleDragEnd = useCallback((event: { operation: { source: unknown } }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = event.operation.source as any;
    if (!source) return;
    const fromIndex: number = source.initialIndex;
    const toIndex: number = source.index;
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) return;

    const reordered = [...localSubtasksRef.current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setLocalSubtasks(reordered);

    reorderSubtasks(taskId, reordered.map((s, i) => ({ id: s.id, sortOrder: i }))).catch(() => {
      toast.error('Failed to save subtask order');
      onUpdate();
    });
  }, [taskId, onUpdate]);

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
      <div className="space-y-1">
        {localSubtasks.map((sub, index) => (
          <SortableSubtask
            key={sub.id}
            sub={sub}
            index={index}
            group={subtaskGroup}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

interface TaskDetailPanelProps {
  task: TaskResponse;
  onClose: () => void;
  onUpdate: () => void;
  onToggleComplete?: (task: TaskResponse) => void;
}

export function TaskDetailPanel({ task, onClose, onUpdate, onToggleComplete }: TaskDetailPanelProps) {
  const { localeCode } = useLocale();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [dueTime, setDueTime] = useState(() => extractLocalTime(task.dueDateTime));
  const dueDateRef = useRef(task.dueDate ?? '');
  const dueTimeRef = useRef(extractLocalTime(task.dueDateTime));
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [allTags, setAllTags] = useState<TagFull[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const isCompleted = !!task.completedAt;

  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setDueDate(task.dueDate ?? '');
    setDueTime(extractLocalTime(task.dueDateTime));
    dueDateRef.current = task.dueDate ?? '';
    dueTimeRef.current = extractLocalTime(task.dueDateTime);
  }, [task]);

  useEffect(() => {
    getProjectMembers(task.projectId).then(setMembers).catch(() => {});
  }, [task.projectId]);

  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
  }, []);

  useEffect(() => {
    listTags().then(setAllTags).catch(() => {});
  }, []);

  const handleMoveProject = async (newProjectId: string) => {
    if (newProjectId === task.projectId) return;
    try {
      await moveTask(task.id, newProjectId);
      onUpdate();
    } catch {
      toast.error('Failed to move task');
    }
  };

  const originalDueTime = extractLocalTime(task.dueDateTime);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (task.occurrenceDate) {
        // Editing a virtual occurrence — save field overrides via occurrence endpoint
        await editOccurrence(task.id, task.occurrenceDate, {
          title: title !== task.title ? title : undefined,
          description: description !== task.description ? description : undefined,
          priority: priority !== task.priority ? priority : undefined,
        });
      } else {
        // Normal task or series master
        const dateChanged = dueDateRef.current !== (task.dueDate ?? '');
        const timeChanged = dueTimeRef.current !== originalDueTime;

        let dueDatePayload: string | undefined;
        let clearDueDatePayload: boolean | undefined;
        let dueDateTimePayload: string | undefined;
        let clearDueDateTimePayload: boolean | undefined;

        if (dateChanged) {
          if (dueDateRef.current) dueDatePayload = dueDateRef.current;
          else { clearDueDatePayload = true; clearDueDateTimePayload = true; }
        }

        if (dueDateRef.current && dueTimeRef.current && (dateChanged || timeChanged)) {
          dueDateTimePayload = new Date(`${dueDateRef.current}T${dueTimeRef.current}`).toISOString();
        } else if (timeChanged && !dueTimeRef.current) {
          clearDueDateTimePayload = true;
        } else if (dateChanged && dueDateRef.current && !dueTimeRef.current) {
          clearDueDateTimePayload = true;
        }

        await updateTask(task.id, {
          title: title !== task.title ? title : undefined,
          description: description !== task.description ? description : undefined,
          priority: priority !== task.priority ? priority : undefined,
          dueDate: dueDatePayload,
          clearDueDate: clearDueDatePayload,
          dueDateTime: dueDateTimePayload,
          clearDueDateTime: clearDueDateTimePayload,
        });
      }
      onUpdate();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (task.occurrenceDate) {
      setShowDeleteModal(true);
    } else {
      if (!confirm('Delete this task?')) return;
      try {
        await deleteTask(task.id);
        onUpdate();
        onClose();
      } catch {
        toast.error('Failed to delete');
      }
    }
  };

  const handleDeleteThisOnly = async () => {
    setShowDeleteModal(false);
    try {
      await skipOccurrence(task.id, task.occurrenceDate!);
      onUpdate();
      onClose();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleDeleteAll = async () => {
    setShowDeleteModal(false);
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
      if (userId === null) {
        await updateTask(task.id, { clearAssignedTo: true });
      } else {
        await updateTask(task.id, { assignedToId: userId });
      }
      onUpdate();
    } catch {
      toast.error('Failed to assign task');
    }
  };

  const handleAddTag = async (tagId: string) => {
    try {
      await addTagToTask(task.id, tagId);
      setTagOpen(false);
      setTagSearch('');
      onUpdate();
    } catch {
      toast.error('Failed to add tag');
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      await removeTagFromTask(task.id, tagId);
      onUpdate();
    } catch {
      toast.error('Failed to remove tag');
    }
  };

  const handleCreateAndAddTag = async (name: string) => {
    try {
      const newTag = await createTag({ name });
      setAllTags(prev => [...prev, newTag]);
      await addTagToTask(task.id, newTag.id);
      setTagOpen(false);
      setTagSearch('');
      onUpdate();
    } catch {
      toast.error('Failed to create tag');
    }
  };

  // Save on blur for title/description
  const handleBlur = () => {
    if (title !== task.title || description !== task.description || priority !== task.priority || dueDateRef.current !== (task.dueDate ?? '') || dueTimeRef.current !== originalDueTime) {
      handleSave();
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 md:static md:z-auto md:w-96 md:border-l md:border-gray-200 md:dark:border-gray-700">
      {/* Mobile overlay */}
      <div className="absolute inset-0 bg-black/50 md:hidden" onClick={onClose} />

      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md md:max-w-none md:static bg-white dark:bg-gray-900 flex flex-col shadow-xl md:shadow-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1.5" style={{ color: task.projectColor }}>
            <FolderOpen size={14} />
            <select
              value={task.projectId}
              onChange={(e) => handleMoveProject(e.target.value)}
              className="text-xs px-1.5 py-1 rounded border-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400"
              style={{ backgroundColor: task.projectColor + '20', color: task.projectColor }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title */}
          <div className="flex items-start gap-3">
            <button
              onClick={() => onToggleComplete?.(task)}
              className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mt-1 ${
                isCompleted
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
              }`}
            >
              {isCompleted && <Check size={12} strokeWidth={3} />}
            </button>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleBlur}
              className={`flex-1 text-lg font-medium bg-transparent border-none outline-none ${
                isCompleted ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'
              }`}
              placeholder="Task title"
            />
          </div>

          {/* Due Date row */}
          <div className="flex items-center gap-2">
            <LocaleDateInput
              value={dueDate}
              onChange={(val) => { dueDateRef.current = val; setDueDate(val); if (!val) { dueTimeRef.current = ''; setDueTime(''); } }}
              onBlur={handleBlur}
              className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300 flex-1"
            />
            <LocaleTimeInput
              value={dueTime}
              onChange={(value) => { dueTimeRef.current = value; setDueTime(value); }}
              onBlur={handleBlur}
              disabled={!dueDate}
              className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300 w-28 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          </div>

          {/* Reminders */}
          <RemindersSection task={task} dueTime={dueTime} onUpdate={onUpdate} />

          {/* Recurrence + Priority row */}
          <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-2 ml-auto">
              <Flag size={16} className="text-gray-400 flex-shrink-0" />
              <select
                value={priority}
                onChange={(e) => {
                  const newPriority = Number(e.target.value);
                  setPriority(newPriority);
                  if (newPriority === task.priority) return;
                  setSaving(true);
                  const save = task.occurrenceDate
                    ? editOccurrence(task.id, task.occurrenceDate, { priority: newPriority })
                    : updateTask(task.id, { priority: newPriority });
                  save.then(onUpdate).catch(() => toast.error('Failed to save')).finally(() => setSaving(false));
                }}
                className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300"
              >
                {[PRIORITIES[0], PRIORITIES[3], PRIORITIES[2], PRIORITIES[1]].map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

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
          <div className="flex flex-wrap items-center gap-1.5 relative">
            <Tag size={14} className="text-gray-400 flex-shrink-0" />
            {task.tags.map(tag => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: tag.color + '20', color: tag.color }}
              >
                {tag.name}
                <button
                  onClick={() => handleRemoveTag(tag.id)}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <button
              onClick={() => { setTagOpen(true); setTimeout(() => tagInputRef.current?.focus(), 0); }}
              className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5 transition-colors"
            >
              <Plus size={12} />
              Add tag
            </button>
            {tagOpen && (
              <div className="absolute top-full left-0 mt-1 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg w-52">
                <input
                  ref={tagInputRef}
                  value={tagSearch}
                  onChange={e => setTagSearch(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setTagOpen(false); setTagSearch(''); return; }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = tagSearch.trim();
                      if (!trimmed) return;
                      const available = allTags
                        .filter(t => !task.tags.some(tt => tt.id === t.id))
                        .filter(t => t.name.toLowerCase().includes(trimmed.toLowerCase()));
                      const exact = available.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
                      const canCreate = !allTags.some(t => t.name.toLowerCase() === trimmed.toLowerCase());
                      if (exact) handleAddTag(exact.id);
                      else if (canCreate) handleCreateAndAddTag(trimmed);
                      else if (available.length > 0) handleAddTag(available[0].id);
                    }
                  }}
                  onBlur={() => { setTimeout(() => { setTagOpen(false); setTagSearch(''); }, 100); }}
                  placeholder="Search or create..."
                  className="w-full px-3 py-2 text-sm bg-transparent border-b border-gray-200 dark:border-gray-700 outline-none text-gray-900 dark:text-white"
                />
                <div className="max-h-40 overflow-y-auto py-1">
                  {allTags
                    .filter(t => !task.tags.some(tt => tt.id === t.id))
                    .filter(t => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                    .map(t => (
                      <button
                        key={t.id}
                        onMouseDown={(e) => { e.preventDefault(); handleAddTag(t.id); }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </button>
                    ))
                  }
                  {tagSearch.trim() && !allTags.some(t => t.name.toLowerCase() === tagSearch.trim().toLowerCase()) && (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); handleCreateAndAddTag(tagSearch.trim()); }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    >
                      <Plus size={12} />
                      Create "{tagSearch.trim()}"
                    </button>
                  )}
                  {!tagSearch && allTags.filter(t => !task.tags.some(tt => tt.id === t.id)).length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Type to create a tag</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="-mx-4 border-t border-b border-gray-200 dark:border-gray-700">
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleBlur}
              placeholder="Add description..."
              style={{ minHeight: '6rem' }}
              className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none resize-none px-4 py-2"
            />
          </div>

          {/* Subtasks */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subtasks</h4>
            <SubtaskDragContainer
              taskId={task.id}
              subtasks={task.subtasks}
              onToggle={handleToggleSubtask}
              onDelete={handleDeleteSubtask}
              onUpdate={onUpdate}
            />
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
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 flex items-center justify-between">
          <span>{saving ? 'Saving...' : `Created by ${task.createdByName} · ${new Date(task.createdAt).toLocaleString(localeCode, { dateStyle: 'medium', timeStyle: 'short' })}`}</span>
          <button onClick={handleDelete} className="p-1 text-gray-400 hover:text-red-500 rounded">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>

    <OccurrenceDeleteModal
      open={showDeleteModal}
      onCancel={() => setShowDeleteModal(false)}
      onThisOnly={handleDeleteThisOnly}
      onAll={handleDeleteAll}
    />
    </>
  );
}
