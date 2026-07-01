import { useState, useRef } from 'react';
import { Bell, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { TaskResponse, ReminderResponse } from '../../types/api';
import { addReminder, deleteReminder } from '../../api/tasks';

interface Props {
  task: TaskResponse;
  dueTime: string;
  onUpdate: () => void;
}

const REMINDER_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: 'On time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 2880, label: '2 days before' },
];

type Unit = 'minutes' | 'hours' | 'days';

const UNIT_MULTIPLIERS: Record<Unit, number> = {
  minutes: 1,
  hours: 60,
  days: 1440,
};

export function offsetMinutesToLabel(m: number): string {
  if (m === 0) return 'On time';
  if (m < 60) return `${m} min before`;
  if (m < 1440) {
    const h = m / 60;
    return `${h} hour${h === 1 ? '' : 's'} before`;
  }
  const days = Math.floor(m / 1440);
  const remainder = m % 1440;
  const dayLabel = `${days} day${days === 1 ? '' : 's'}`;
  if (remainder === 0) return `${dayLabel} before`;
  if (remainder % 60 === 0) {
    const hours = remainder / 60;
    return `${dayLabel}, ${hours} hour${hours === 1 ? '' : 's'} before`;
  }
  return `${dayLabel}, ${remainder} min before`;
}

function ReminderChip({ reminder, taskId, onRemoved }: {
  reminder: ReminderResponse;
  taskId: string;
  onRemoved: () => void;
}) {
  const handleDelete = async () => {
    try {
      await deleteReminder(taskId, reminder.id);
      onRemoved();
    } catch {
      toast.error('Failed to remove reminder');
    }
  };

  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
      {offsetMinutesToLabel(reminder.offsetMinutes)}
      <button
        onClick={handleDelete}
        className="opacity-60 hover:opacity-100 transition-opacity"
        aria-label={`Remove ${offsetMinutesToLabel(reminder.offsetMinutes)} reminder`}
      >
        <X size={10} />
      </button>
    </span>
  );
}

export function RemindersSection({ task, dueTime, onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [customUnit, setCustomUnit] = useState<Unit>('minutes');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggleOpen = () => {
    if (open) {
      setOpen(false);
      setDropdownPos(null);
    } else {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setDropdownPos({ top: rect.bottom + 4, left: rect.left });
      }
      setOpen(true);
    }
  };

  if (!dueTime) return null;

  const reminders = task.reminders ?? [];
  const existingOffsets = new Set(reminders.map(r => r.offsetMinutes));
  const availablePresets = REMINDER_PRESETS.filter(p => !existingOffsets.has(p.value));

  const handleAddPreset = async (offsetMinutes: number) => {
    try {
      await addReminder(task.id, offsetMinutes);
      setOpen(false);
      setDropdownPos(null);
      onUpdate();
    } catch {
      toast.error('Failed to add reminder');
    }
  };

  const handleAddCustom = async () => {
    const num = parseInt(customValue, 10);
    if (!customValue || isNaN(num) || num < 0) {
      toast.error('Please enter a valid number');
      return;
    }
    const offsetMinutes = num * UNIT_MULTIPLIERS[customUnit];
    if (existingOffsets.has(offsetMinutes)) {
      toast.error('A reminder with this timing already exists');
      return;
    }
    try {
      await addReminder(task.id, offsetMinutes);
      setCustomValue('');
      setOpen(false);
      setDropdownPos(null);
      onUpdate();
    } catch {
      toast.error('Failed to add reminder');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 relative" ref={containerRef}>
      <Bell size={14} className="text-gray-400 flex-shrink-0" />
      {reminders
        .slice()
        .sort((a, b) => b.offsetMinutes - a.offsetMinutes)
        .map(r => (
          <ReminderChip key={r.id} reminder={r} taskId={task.id} onRemoved={onUpdate} />
        ))}
      <button
        onClick={handleToggleOpen}
        className="text-xs text-gray-400 hover:text-amber-500 flex items-center gap-0.5 transition-colors"
      >
        <Plus size={12} />
        Add reminder
      </button>

      {open && dropdownPos && (
        <div
          className="fixed z-[200] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg w-56"
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
        >
          {availablePresets.length > 0 && (
            <div className="py-1">
              {availablePresets.map(preset => (
                <button
                  key={preset.value}
                  onMouseDown={(e) => { e.preventDefault(); handleAddPreset(preset.value); }}
                  className="w-full px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 p-2 space-y-2">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium px-1">Custom</div>
            <div className="flex gap-1">
              <input
                type="number"
                min="0"
                value={customValue}
                onChange={e => setCustomValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); } if (e.key === 'Escape') setOpen(false); }}
                placeholder="0"
                className="w-16 px-2 py-1 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none text-gray-900 dark:text-white focus:border-amber-400"
              />
              <select
                value={customUnit}
                onChange={e => setCustomUnit(e.target.value as Unit)}
                aria-label="Reminder unit"
                className="flex-1 px-1 py-1 text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded outline-none text-gray-700 dark:text-gray-300"
              >
                <option value="minutes">min</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </div>
            <button
              onMouseDown={(e) => { e.preventDefault(); handleAddCustom(); }}
              className="w-full px-2 py-1 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Close popover on outside click */}
      {open && (
        <div
          className="fixed inset-0 z-[9]"
          onMouseDown={() => { setOpen(false); setDropdownPos(null); }}
        />
      )}
    </div>
  );
}
