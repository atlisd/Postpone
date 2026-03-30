import { useDraggable } from '@dnd-kit/react';
import type { TaskResponse } from '../../types/api';

interface CalendarTaskChipProps {
  task: TaskResponse;
  onSelect: () => void;
}

export function CalendarTaskChip({ task, onSelect }: CalendarTaskChipProps) {
  const dragId = `${task.id}_${task.occurrenceDate ?? 'single'}`;
  const { ref } = useDraggable({ id: dragId });

  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={`text-xs px-1.5 py-0.5 rounded truncate cursor-pointer transition-opacity hover:opacity-80 ${
        task.completedAt ? 'line-through opacity-50' : ''
      }`}
      style={{
        backgroundColor: task.projectColor + '20',
        color: task.projectColor,
        borderLeft: `2px solid ${task.projectColor}`,
      }}
      title={task.title}
    >
      {task.title}
    </div>
  );
}
