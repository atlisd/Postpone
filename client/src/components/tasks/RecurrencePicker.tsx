import { useState } from 'react';
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

  // Basic parsing for display
  if (rrule.includes('FREQ=DAILY')) return 'Daily';
  if (rrule.includes('FREQ=WEEKLY')) {
    const match = rrule.match(/BYDAY=([^;]+)/);
    if (match) return `Weekly on ${match[1]}`;
    const interval = rrule.match(/INTERVAL=(\d+)/);
    if (interval) return `Every ${interval[1]} weeks`;
    return 'Weekly';
  }
  if (rrule.includes('FREQ=MONTHLY')) return 'Monthly';
  if (rrule.includes('FREQ=YEARLY')) return 'Yearly';
  return rrule;
}

export function RecurrencePicker({ currentRrule, onSet, onRemove }: RecurrencePickerProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customFreq, setCustomFreq] = useState('WEEKLY');
  const [customInterval, setCustomInterval] = useState(1);
  const [customDays, setCustomDays] = useState<string[]>([]);

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

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
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

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 w-56">
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
      )}
    </div>
  );
}
