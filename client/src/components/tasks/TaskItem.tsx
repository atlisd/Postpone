import { Check, Flag, Repeat, GripVertical, FileText, EyeOff, BellOff } from 'lucide-react';
import type { TaskResponse } from '../../types/api';
import { formatDueDate, formatDueTime, dueDateColor } from '../../lib/dates';
import { getPriority } from '../../lib/priorities';
import { useLocale } from '../../contexts/LocaleContext';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskItemProps {
  task: TaskResponse;
  onToggleComplete: (task: TaskResponse) => void;
  onSelect: (task: TaskResponse) => void;
  isSelected?: boolean;
  showProject?: boolean;
}

export function TaskItem({ task, onToggleComplete, onSelect, isSelected, showProject }: TaskItemProps) {
  const { locale } = useLocale();
  const isCompleted = !!task.completedAt;
  const priority = getPriority(task.priority);
  const subtaskTotal = task.subtasks.length;
  const subtaskDone = task.subtasks.filter(s => s.isCompleted).length;
  const itemId = `${task.id}_${task.occurrenceDate ?? 'single'}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemId,
    data: { type: 'task-item', taskId: task.id, occurrenceDate: task.occurrenceDate },
  });

  const dueLabel = task.dueDate
    ? `${formatDueDate(task.dueDate, locale)}${formatDueTime(task.dueDateTime, locale) ? ` ${formatDueTime(task.dueDateTime, locale)}` : ''}`
    : null;

  return (
    <div
      ref={setNodeRef}
      data-task-drag-id={itemId}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`relative group flex items-center gap-3 px-4 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors ${
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
      } ${isCompleted ? 'opacity-50' : ''} ${isDragging ? 'opacity-40' : ''}`}
      onClick={() => onSelect(task)}
    >
      {/* Drag handle */}
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} className="text-gray-300 dark:text-gray-600" />
      </span>

      {/* Checkbox — squarish */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
        className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
          isCompleted
            ? 'bg-blue-500 border-blue-500 text-white'
            : `border-gray-300 dark:border-gray-600 hover:border-blue-400 ${priority.color}`
        }`}
      >
        {isCompleted && <Check size={10} strokeWidth={3} />}
      </button>

      {/* Title + icons */}
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-sm truncate ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </span>
          {task.priority > 0 && (
            <Flag size={11} className={`flex-shrink-0 ${priority.color}`} fill="currentColor" />
          )}
          {task.rrule && (
            <Repeat size={11} className="flex-shrink-0 text-gray-400" />
          )}
          {task.description && (
            <FileText size={11} className="flex-shrink-0 text-gray-400" />
          )}
          {subtaskTotal > 0 && (
            <span className="text-xs text-gray-400 flex-shrink-0">{subtaskDone}/{subtaskTotal}</span>
          )}
          {task.hideFromCalendar && (
            <EyeOff size={11} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
          )}
          {task.skipNotification && (
            <BellOff size={11} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
          )}
        </div>

        {/* Meta: project + date — right side on desktop, below on mobile */}
        <div className="flex items-center gap-2 mt-0.5 sm:mt-0 sm:ml-auto flex-shrink-0 flex-wrap sm:flex-nowrap">
          {task.tags.map(tag => (
            <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: tag.color + '20', color: tag.color }}>
              {tag.name}
            </span>
          ))}
          {task.assignedToName && (
            <span className="text-xs text-gray-400">→ {task.assignedToName}</span>
          )}
          {showProject && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{task.projectName}</span>
          )}
          {dueLabel && (
            <span className={`text-xs font-medium ${dueDateColor(task.dueDate!)}`}>{dueLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
}
