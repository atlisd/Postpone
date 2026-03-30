import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Repeat, X } from 'lucide-react';

const PRESETS = [
  { label: 'Every day', rrule: 'FREQ=DAILY' },
  { label: 'Every weekday', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every week', rrule: 'FREQ=WEEKLY' },
  { label: 'Every 2 weeks', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Every month', rrule: 'FREQ=MONTHLY' },
  { label: 'Every year', rrule: 'FREQ=YEARLY' },
];

interface RecurrencePickerProps {
  currentRrule: string | null;
  onSet: (rrule: string) => void;
  onRemove: () => void;
}

export function rruleToHuman(rrule: string | null): string {
  if (!rrule) return '';
  const preset = PRESETS.find(p => p.rrule === rrule);
  if (preset) return preset.label;

  const interval = parseInt(rrule.match(/INTERVAL=(\d+)/)?.[1] ?? '1', 10);
  const days = rrule.match(/BYDAY=([^;]+)/)?.[1];

  if (rrule.includes('FREQ=DAILY')) {
    return interval > 1 ? `Every ${interval} days` : 'Daily';
  }
  if (rrule.includes('FREQ=WEEKLY')) {
    const base = interval > 1 ? `Every ${interval} weeks` : 'Weekly';
    return days ? `${base} on ${days}` : base;
  }
  if (rrule.includes('FREQ=MONTHLY')) {
    return interval > 1 ? `Every ${interval} months` : 'Monthly';
  }
  if (rrule.includes('FREQ=YEARLY')) {
    return interval > 1 ? `Every ${interval} years` : 'Yearly';
  }
  return 'Custom';
}

export function RecurrencePicker({ currentRrule, onSet, onRemove }: RecurrencePickerProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customFreq, setCustomFreq] = useState('WEEKLY');
  const [customInterval, setCustomInterval] = useState(1);
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCustomMode(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handlePreset = (rrule: string) => {
    onSet(rrule);
    setOpen(false);
  };

  const handleCustomSubmit = () => {
    let rrule = `FREQ=${customFreq}`;
    if (customInterval > 1) rrule += `;INTERVAL=${customInterval}`;
    if (customFreq === 'WEEKLY' && customDays.length > 0) {
      rrule += `;BYDAY=${customDays.join(',')}`;
    }
    onSet(rrule);
    setOpen(false);
    setCustomMode(false);
  };

  const toggleDay = (day: string) => {
    setCustomDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const days = [
    { key: 'MO', label: 'M' },
    { key: 'TU', label: 'T' },
    { key: 'WE', label: 'W' },
    { key: 'TH', label: 'T' },
    { key: 'FR', label: 'F' },
    { key: 'SA', label: 'S' },
    { key: 'SU', label: 'S' },
  ];

  const dropdown = (
    <div
      style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-56"
      onMouseDown={e => e.stopPropagation()}
    >
      {!customMode ? (
        <div className="py-1">
          {PRESETS.map(preset => (
            <button
              key={preset.rrule}
              onClick={() => handlePreset(preset.rrule)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                currentRrule === preset.rrule ? 'text-blue-600 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <button
            onClick={() => setCustomMode(true)}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Custom...
          </button>
        </div>
      ) : (
        <div className="p-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={customInterval}
              onChange={(e) => setCustomInterval(Number(e.target.value))}
              className="w-14 px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <select
              value={customFreq}
              onChange={(e) => setCustomFreq(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="DAILY">day(s)</option>
              <option value="WEEKLY">week(s)</option>
              <option value="MONTHLY">month(s)</option>
              <option value="YEARLY">year(s)</option>
            </select>
          </div>

          {customFreq === 'WEEKLY' && (
            <div className="flex gap-1">
              {days.map(day => (
                <button
                  key={day.key}
                  onClick={() => toggleDay(day.key)}
                  className={`w-7 h-7 rounded-full text-xs font-medium ${
                    customDays.includes(day.key)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleCustomSubmit}
              className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded font-medium hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => { setCustomMode(false); setOpen(false); }}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          ref={buttonRef}
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-2 text-sm px-2 py-1 rounded border transition-colors ${
            currentRrule
              ? 'border-blue-300 dark:border-gray-500 text-blue-600 dark:text-gray-100 bg-blue-50 dark:bg-gray-700/50'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Repeat size={14} />
          {currentRrule ? rruleToHuman(currentRrule) : 'Repeat'}
        </button>
        {currentRrule && (
          <button
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title="Remove recurrence"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && createPortal(dropdown, document.body)}
    </div>
  );
}
