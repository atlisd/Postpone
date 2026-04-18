import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { TaskResponse } from '../../types/api';

export type ChipPosition = 'single' | 'start' | 'middle' | 'end';

interface CalendarTaskChipProps {
  task: TaskResponse;
  onSelect: () => void;
  position?: ChipPosition;
}

export function CalendarTaskChip({ task, onSelect, position = 'single' }: CalendarTaskChipProps) {
  const dragId = `${task.id}_${task.occurrenceDate ?? 'single'}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: position === 'middle' || position === 'end',
    data: { type: 'calendar-chip', taskId: task.id, occurrenceDate: task.occurrenceDate },
  });

  const isBar = position === 'middle' || position === 'end';

  const roundingClass = position === 'single'
    ? 'rounded'
    : position === 'start'
    ? 'rounded-l'
    : position === 'end'
    ? 'rounded-r'
    : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onSelect}
      className={`text-xs py-0.5 cursor-pointer transition-opacity hover:opacity-80 ${roundingClass} ${
        task.completedAt ? 'opacity-50' : ''
      } ${isBar ? 'mx-0' : 'px-1.5 truncate'} ${isDragging ? 'opacity-50' : ''}`}
      style={{
        backgroundColor: task.projectColor + '20',
        color: isBar ? 'transparent' : task.projectColor,
        borderLeft: position === 'single' || position === 'start' ? `2px solid ${task.projectColor}` : undefined,
        borderRight: position === 'end' ? `2px solid ${task.projectColor}` : undefined,
        minHeight: '1.2em',
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }}
      title={task.title}
    >
      {isBar ? '\u00A0' : (
        <span className={task.completedAt ? 'line-through' : ''}>{task.title}</span>
      )}
    </div>
  );
}
