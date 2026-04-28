import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale } from '../../contexts/LocaleContext';
import { LocaleDateInput } from '../shared/LocaleDateInput';
import { LocaleTimeInput } from '../shared/LocaleTimeInput';

function extractLocalTime(dueDateTimeUtc: string | null): string {
  if (!dueDateTimeUtc) return '';
  const normalized = /[Z+\-]\d*$/.test(dueDateTimeUtc) ? dueDateTimeUtc : dueDateTimeUtc + 'Z';
  const d = new Date(normalized);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
import { format, differenceInCalendarDays, parseISO, addDays } from 'date-fns';
import { parseNaturalDate } from '../../lib/naturalDate';
import { formatDueDate } from '../../lib/dates';
import { X, Trash2, Plus, Check, Flag, UserPlus, FolderOpen, GripVertical, Tag, Eye, EyeOff, CalendarDays } from 'lucide-react';
import type { TaskResponse, ProjectResponse } from '../../types/api';
import { updateTask, deleteTask, createSubtask, updateSubtask, deleteSubtask, reorderSubtasks, setRecurrence, removeRecurrence, moveTask, skipOccurrence, editOccurrence, addTagToTask, removeTagFromTask, updateSeriesTime } from '../../api/tasks';
import { listTags, createTag } from '../../api/tags';
import type { TagFull } from '../../types/api';
import type { SubtaskResponse } from '../../types/api';
import { getProjectMembers, listProjects } from '../../api/projects';
import type { ProjectMember } from '../../api/projects';
import { PRIORITIES } from '../../lib/priorities';
import { parseUrls, isPwa } from '../../lib/urls';
import { RecurrencePicker } from './RecurrencePicker';
import { RemindersSection } from './RemindersSection';
import { OccurrenceDeleteModal } from './OccurrenceDeleteModal';
import { toast } from 'sonner';

function DescriptionWithLinks({ text, onClick }: { text: string; onClick: () => void }) {
  const segments = parseUrls(text);
  return (
    <div
      onClick={onClick}
      className="w-full text-sm text-gray-700 dark:text-gray-300 px-4 py-2 whitespace-pre-wrap break-words cursor-text"
      style={{ minHeight: '6rem' }}
    >
      {segments.map((seg, i) =>
        seg.type === 'url' ? (
          <a
            key={i}
            href={seg.value}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
              if (isPwa()) window.open(seg.value, '_blank', 'noopener,noreferrer');
            }}
            className="text-blue-500 hover:underline break-all"
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </div>
  );
}

function SortableSubtask({ sub, onToggle, onDelete, onEdit }: {
  sub: SubtaskResponse;
  onToggle: (id: string, isCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newTitle: string, originalTitle: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(sub.title);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: sub.id });

  const commitEdit = () => {
    onEdit(sub.id, editValue, sub.title);
    setIsEditing(false);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex items-center gap-2 group ${isDragging ? 'opacity-40' : ''}`}
    >
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        className="absolute -left-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
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
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { setEditValue(sub.title); setIsEditing(false); }
          }}
          className={`text-sm flex-1 bg-transparent outline-none border-b border-blue-400 ${sub.isCompleted ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}
        />
      ) : (
        <span
          onClick={() => { setEditValue(sub.title); setIsEditing(true); }}
          className={`text-sm flex-1 cursor-text ${sub.isCompleted ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}
        >
          {sub.title}
        </span>
      )}
      <button
        onClick={() => onDelete(sub.id)}
        className="p-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function SubtaskDragContainer({ taskId, subtasks, onToggle, onDelete, onEdit, onUpdate }: {
  taskId: string;
  subtasks: SubtaskResponse[];
  onToggle: (id: string, isCompleted: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, newTitle: string, originalTitle: string) => void;
  onUpdate: () => void;
}) {
  const [localSubtasks, setLocalSubtasks] = useState<SubtaskResponse[]>(subtasks);

  useEffect(() => {
    setLocalSubtasks(subtasks);
  }, [subtasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalSubtasks(current => {
      const oldIndex = current.findIndex(s => s.id === active.id);
      const newIndex = current.findIndex(s => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      const reordered = arrayMove(current, oldIndex, newIndex);
      reorderSubtasks(taskId, reordered.map((s, i) => ({ id: s.id, sortOrder: i }))).catch(() => {
        toast.error('Failed to save subtask order');
        onUpdate();
      });
      return reordered;
    });
  }, [taskId, onUpdate]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={localSubtasks.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {localSubtasks.map(sub => (
            <SortableSubtask
              key={sub.id}
              sub={sub}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface TaskDetailPanelProps {
  task: TaskResponse;
  onClose: () => void;
  onUpdate: () => void;
  onToggleComplete?: (task: TaskResponse) => void;
}

export function TaskDetailPanel({ task, onClose, onUpdate, onToggleComplete }: TaskDetailPanelProps) {
  const { localeCode, locale } = useLocale();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [dueTime, setDueTime] = useState(() => extractLocalTime(task.dueDateTime));
  const [endDate, setEndDate] = useState(task.endDate ?? '');
  const [hasDuration, setHasDuration] = useState(!!task.endDate);
  const dueDateRef = useRef(task.dueDate ?? '');
  const dueTimeRef = useRef(extractLocalTime(task.dueDateTime));
  const endDateRef = useRef(task.endDate ?? '');
  const taskIdRef = useRef(task.id);
  const [hideFromCalendar, setHideFromCalendar] = useState(task.hideFromCalendar);
  const [skipNotification, setSkipNotification] = useState(task.skipNotification);
  const [naturalInput, setNaturalInput] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  const [saving, setSaving] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [allTags, setAllTags] = useState<TagFull[]>([]);
  const [tagSearch, setTagSearch] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const naturalDateInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLDivElement>(null);
  const isCompleted = !!task.completedAt;

  useEffect(() => {
    const el = descriptionRef.current;
    if (el && document.activeElement !== el && el.textContent !== description) {
      el.textContent = description;
    }
  }, [description, isEditingDescription]);

  useEffect(() => {
    const taskChanged = taskIdRef.current !== task.id;
    taskIdRef.current = task.id;
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setHideFromCalendar(task.hideFromCalendar);
    setSkipNotification(task.skipNotification);
    setDueDate(task.dueDate ?? '');
    setDueTime(extractLocalTime(task.dueDateTime));
    setEndDate(task.endDate ?? '');
    // Only reset hasDuration to false when switching to a different task.
    // On same-task refreshes, preserve user intent (e.g. user opened "+Add duration"
    // but the save hasn't completed yet, so task.endDate is still null).
    if (task.endDate) {
      setHasDuration(true);
    } else if (taskChanged) {
      setHasDuration(false);
    }
    dueDateRef.current = task.dueDate ?? '';
    dueTimeRef.current = extractLocalTime(task.dueDateTime);
    endDateRef.current = task.endDate ?? '';
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (tagOpen) return;
      if (naturalDateInputRef.current && document.activeElement === naturalDateInputRef.current) return;
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, tagOpen]);

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

        // Time changes apply to the whole series
        const timeChanged = dueTimeRef.current !== originalDueTime;
        if (timeChanged) {
          if (dueTimeRef.current && dueDateRef.current) {
            const dt = new Date(`${dueDateRef.current}T${dueTimeRef.current}`).toISOString();
            await updateSeriesTime(task.id, dt);
          } else if (!dueTimeRef.current) {
            await updateSeriesTime(task.id, null);
          }
        }

        // Duration (endDate) is a series-level property — apply clearing to the master
        const endDateChanged = endDateRef.current !== (task.endDate ?? '');
        if (endDateChanged && !endDateRef.current) {
          await updateTask(task.id, { clearEndDate: true });
        }
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

        const endDateChanged = endDateRef.current !== (task.endDate ?? '');
        const endDatePayload = endDateChanged && endDateRef.current ? endDateRef.current : undefined;
        const clearEndDatePayload = endDateChanged && !endDateRef.current ? true : undefined;

        const effectiveDueDate = dueDateRef.current || (task.dueDate ?? '');
        const effectiveEndDate = endDateRef.current || (task.endDate ?? '');
        if (effectiveDueDate && effectiveEndDate && effectiveEndDate < effectiveDueDate) {
          toast.error('End date cannot be before the due date');
          setSaving(false);
          return;
        }

        await updateTask(task.id, {
          title: title !== task.title ? title : undefined,
          description: description !== task.description ? description : undefined,
          priority: priority !== task.priority ? priority : undefined,
          dueDate: dueDatePayload,
          clearDueDate: clearDueDatePayload,
          endDate: endDatePayload,
          clearEndDate: clearEndDatePayload,
          dueDateTime: dueDateTimePayload,
          clearDueDateTime: clearDueDateTimePayload,
          hideFromCalendar: hideFromCalendar !== task.hideFromCalendar ? hideFromCalendar : undefined,
          skipNotification: skipNotification !== task.skipNotification ? skipNotification : undefined,
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

  const handleEditSubtask = async (subtaskId: string, newTitle: string, originalTitle: string) => {
    if (!newTitle.trim() || newTitle.trim() === originalTitle.trim()) return;
    try {
      await updateSubtask(subtaskId, { title: newTitle.trim() });
      onUpdate();
    } catch {
      toast.error('Failed to update subtask');
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

  const durationDays = useMemo(() => {
    if (!dueDate || !endDate) return null;
    const diff = differenceInCalendarDays(parseISO(endDate), parseISO(dueDate));
    return diff >= 0 ? diff + 1 : null;
  }, [dueDate, endDate]);

  const naturalParsed = parseNaturalDate(naturalInput);
  const naturalChipLabel = naturalParsed
    ? naturalParsed.dueDateTime
      ? `${formatDueDate(naturalParsed.dueDate, locale)}, ${format(new Date(naturalParsed.dueDateTime), 'p', { locale })}`
      : formatDueDate(naturalParsed.dueDate, locale)
    : '';

  const applyNaturalDate = () => {
    if (!naturalParsed) return;
    const newDate = naturalParsed.dueDate;
    const newTime = naturalParsed.dueDateTime ? extractLocalTime(naturalParsed.dueDateTime) : '';
    dueDateRef.current = newDate;
    dueTimeRef.current = newTime;
    setDueDate(newDate);
    setDueTime(newTime);
    setNaturalInput('');
    handleBlur();
  };

  // Save on blur for title/description
  const handleBlur = () => {
    setIsEditingDescription(false);
    if (title !== task.title || description !== task.description || priority !== task.priority || hideFromCalendar !== task.hideFromCalendar || skipNotification !== task.skipNotification || dueDateRef.current !== (task.dueDate ?? '') || dueTimeRef.current !== originalDueTime || endDateRef.current !== (task.endDate ?? '')) {
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

          {/* Natural date input */}
          <div className="flex flex-col gap-1">
            <input
              ref={naturalDateInputRef}
              value={naturalInput}
              onChange={(e) => setNaturalInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyNaturalDate(); }
                if (e.key === 'Escape') { e.preventDefault(); setNaturalInput(''); }
              }}
              placeholder='e.g. "tomorrow 4pm" or "friday"'
              className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600"
            />
            {naturalParsed && naturalInput && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full px-2.5 py-1 font-medium">
                  <CalendarDays size={12} />
                  <span>{naturalChipLabel}</span>
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">Enter to apply · ESC to clear</span>
              </div>
            )}
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2">
            {!hasDuration ? (
              <button
                type="button"
                onClick={() => {
                  const base = dueDate ? parseISO(dueDate) : new Date();
                  const defaultEnd = format(addDays(base, 1), 'yyyy-MM-dd');
                  endDateRef.current = defaultEnd;
                  setEndDate(defaultEnd);
                  setHasDuration(true);
                  handleBlur();
                }}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                + Add duration
              </button>
            ) : (
              <>
                <LocaleDateInput
                  value={endDate}
                  onChange={(val) => {
                    endDateRef.current = val;
                    setEndDate(val);
                    handleBlur();
                  }}
                  onBlur={handleBlur}
                  className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-300 flex-1"
                />
                {durationDays !== null && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {durationDays} {durationDays === 1 ? 'day' : 'days'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setHasDuration(false);
                    endDateRef.current = '';
                    setEndDate('');
                    handleBlur();
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X size={14} />
                </button>
              </>
            )}
          </div>

          {/* Notifications */}
          <div className="space-y-1.5">
            <div className={skipNotification ? 'opacity-40 pointer-events-none' : ''}>
              <RemindersSection task={task} dueTime={dueTime} onUpdate={onUpdate} />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipNotification}
                onChange={(e) => {
                  const next = e.target.checked;
                  setSkipNotification(next);
                  setSaving(true);
                  updateTask(task.id, { skipNotification: next })
                    .then(onUpdate)
                    .catch(() => { toast.error('Failed to save'); setSkipNotification(!next); })
                    .finally(() => setSaving(false));
                }}
                className="accent-amber-500"
              />
              Skip notification
            </label>
          </div>

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
            <div className="relative group/hide">
              <button
                onClick={() => {
                  const next = !hideFromCalendar;
                  setHideFromCalendar(next);
                  setSaving(true);
                  updateTask(task.id, { hideFromCalendar: next })
                    .then(onUpdate)
                    .catch(() => { toast.error('Failed to save'); setHideFromCalendar(!next); })
                    .finally(() => setSaving(false));
                }}
                className={`p-1.5 rounded transition-colors ${hideFromCalendar ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
              >
                {hideFromCalendar ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs bg-gray-800 dark:bg-gray-700 text-white rounded whitespace-nowrap opacity-0 group-hover/hide:opacity-100 transition-opacity pointer-events-none z-10">
                {hideFromCalendar ? 'Show in calendar' : 'Hide from calendar'}
              </div>
            </div>
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
            {isEditingDescription || !description ? (
              <div
                ref={descriptionRef}
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => setDescription(e.currentTarget.textContent ?? '')}
                onBlur={handleBlur}
                onFocus={() => setIsEditingDescription(true)}
                data-placeholder="Add description..."
                style={{ minHeight: '6rem' }}
                className="w-full text-sm text-gray-700 dark:text-gray-300 bg-transparent outline-none px-4 py-2 whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-600 empty:before:pointer-events-none"
              />
            ) : (
              <DescriptionWithLinks
                text={description}
                onClick={() => {
                  setIsEditingDescription(true);
                  requestAnimationFrame(() => {
                    const el = descriptionRef.current;
                    if (!el) return;
                    el.focus();
                    const range = document.createRange();
                    const sel = window.getSelection();
                    range.selectNodeContents(el);
                    range.collapse(false);
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                  });
                }}
              />
            )}
          </div>

          {/* Subtasks */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Subtasks</h4>
            <SubtaskDragContainer
              taskId={task.id}
              subtasks={task.subtasks}
              onToggle={handleToggleSubtask}
              onDelete={handleDeleteSubtask}
              onEdit={handleEditSubtask}
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
