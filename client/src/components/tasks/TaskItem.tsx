import { Check, Flag, Repeat } from 'lucide-react';
import type { TaskResponse } from '../../types/api';
import { formatDueDate, dueDateColor } from '../../lib/dates';
import { getPriority } from '../../lib/priorities';

interface TaskItemProps {
  task: TaskResponse;
  onToggleComplete: (task: TaskResponse) => void;
  onSelect: (task: TaskResponse) => void;
  showProject?: boolean;
}

export function TaskItem({ task, onToggleComplete, onSelect, showProject }: TaskItemProps) {
  const isCompleted = !!task.completedAt;
  const priority = getPriority(task.priority);
  const subtaskTotal = task.subtasks.length;
  const subtaskDone = task.subtasks.filter(s => s.isCompleted).length;

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800 transition-colors ${
        isCompleted ? 'opacity-50' : ''
      }`}
      onClick={() => onSelect(task)}
    >
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
        </div>

        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {showProject && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: task.projectColor + '20', color: task.projectColor }}>
              {task.projectName}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-xs ${dueDateColor(task.dueDate)}`}>
              {formatDueDate(task.dueDate)}
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
