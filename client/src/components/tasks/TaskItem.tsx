import { Check, Flag, Repeat, GripVertical, FileText } from 'lucide-react';
import type { TaskResponse } from '../../types/api';
import { formatDueDate, formatDueTime, dueDateColor } from '../../lib/dates';
import { getPriority } from '../../lib/priorities';
import { useSortable } from '@dnd-kit/react/sortable';

interface TaskItemProps {
  task: TaskResponse;
  onToggleComplete: (task: TaskResponse) => void;
  onSelect: (task: TaskResponse) => void;
  showProject?: boolean;
  index: number;
  group?: string;
}

export function TaskItem({ task, onToggleComplete, onSelect, showProject, index, group }: TaskItemProps) {
  const isCompleted = !!task.completedAt;
  const priority = getPriority(task.priority);
  const subtaskTotal = task.subtasks.length;
  const subtaskDone = task.subtasks.filter(s => s.isCompleted).length;
  const { ref, handleRef, isDragging } = useSortable({ id: task.id, index, group: group ?? task.id });

  return (
    <div
      ref={ref}
      className={`relative group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors ${
        isCompleted ? 'opacity-50' : ''
      } ${isDragging ? 'opacity-40' : ''}`}
      onClick={() => onSelect(task)}
    >
      {/* Drag handle */}
      <span
        ref={handleRef}
        className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} className="text-gray-300 dark:text-gray-600" />
      </span>

      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          isCompleted
            ? 'bg-blue-500 border-blue-500 text-white'
            : `border-gray-300 dark:border-gray-600 hover:border-blue-400 ${priority.color}`
        }`}
      >
        {isCompleted && <Check size={12} strokeWidth={3} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900 dark:text-white'}`}>
            {task.title}
          </span>
          {task.priority > 0 && (
            <Flag size={12} className={priority.color} fill="currentColor" />
          )}
          {task.rrule && (
            <Repeat size={12} className="text-gray-400" />
          )}
          {task.description && (
            <FileText size={12} className="text-gray-400" />
          )}
        </div>

        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {showProject && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: task.projectColor + '20', color: task.projectColor }}>
              {task.projectName}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-xs ${dueDateColor(task.dueDate)}`}>
              {formatDueDate(task.dueDate)}{formatDueTime(task.dueDateTime) && ` ${formatDueTime(task.dueDateTime)}`}
            </span>
          )}
          {subtaskTotal > 0 && (
            <span className="text-xs text-gray-400">
              {subtaskDone}/{subtaskTotal}
            </span>
          )}
          {task.tags.map(tag => (
            <span key={tag.id} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: tag.color + '20', color: tag.color }}>
              {tag.name}
            </span>
          ))}
          {task.assignedToName && (
            <span className="text-xs text-gray-400">
              → {task.assignedToName}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
