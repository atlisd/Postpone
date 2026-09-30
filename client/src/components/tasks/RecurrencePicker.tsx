import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Repeat, X } from 'lucide-react';
import { format, parse, type Locale } from 'date-fns';
import { useLocale } from '../../contexts/LocaleContext';

const PRESETS = [
  { label: 'Every day', rrule: 'FREQ=DAILY' },
  { label: 'Every weekday', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Every week', rrule: 'FREQ=WEEKLY' },
  { label: 'Every 2 weeks', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  { label: 'Every month', rrule: 'FREQ=MONTHLY' },
  { label: 'Every year', rrule: 'FREQ=YEARLY' },
];

type EndMode = 'never' | 'until' | 'count';

interface RecurrenceEnd {
  mode: EndMode;
  /** yyyy-MM-dd, used when mode === 'until' */
  until: string;
  /** used when mode === 'count' */
  count: number;
}

interface RecurrencePickerProps {
  currentRrule: string | null;
  /** Series start (yyyy-MM-dd) — the earliest allowed end date. */
  startDate?: string | null;
  onSet: (rrule: string) => void;
  onRemove: () => void;
}

/** Splits an RRULE into its repeat pattern (without UNTIL/COUNT) and its end condition. */
function splitRrule(rrule: string): { base: string; end: RecurrenceEnd } {
  const parts = rrule.split(';');
  const base = parts
    .filter(p => !/^(UNTIL|COUNT)=/i.test(p))
    .join(';');
  const untilRaw = parts.find(p => /^UNTIL=/i.test(p))?.slice(6);
  const countRaw = parts.find(p => /^COUNT=/i.test(p))?.slice(6);

  if (untilRaw) {
    const d = untilRaw.slice(0, 8);
    return { base, end: { mode: 'until', until: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, count: 10 } };
  }
  if (countRaw) {
    return { base, end: { mode: 'count', until: '', count: parseInt(countRaw, 10) || 1 } };
  }
  return { base, end: { mode: 'never', until: '', count: 10 } };
}

function withEnd(base: string, end: RecurrenceEnd): string {
  if (end.mode === 'until' && end.until) return `${base};UNTIL=${end.until.replaceAll('-', '')}`;
  if (end.mode === 'count' && end.count >= 1) return `${base};COUNT=${Math.floor(end.count)}`;
  return base;
}

function baseToHuman(rrule: string): string {
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

function endToHuman(end: RecurrenceEnd, locale?: Locale): string {
  if (end.mode === 'until' && end.until) {
    const d = parse(end.until, 'yyyy-MM-dd', new Date());
    return `until ${format(d, 'MMM d, yyyy', { locale })}`;
  }
  if (end.mode === 'count') return `${end.count} ${end.count === 1 ? 'time' : 'times'}`;
  return '';
}

export function rruleToHuman(rrule: string | null, locale?: Locale): string {
  if (!rrule) return '';
  const { base, end } = splitRrule(rrule);
  const endLabel = endToHuman(end, locale);
  return endLabel ? `${baseToHuman(base)}, ${endLabel}` : baseToHuman(base);
}

function EndEditor({ end, onChange, minDate }: {
  end: RecurrenceEnd;
  onChange: (end: RecurrenceEnd) => void;
  minDate?: string | null;
}) {
  const radioClass = 'accent-blue-600';
  const inputClass = 'px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50';
  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ends</legend>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="radio"
          name="recurrence-end"
          className={radioClass}
          checked={end.mode === 'never'}
          onChange={() => onChange({ ...end, mode: 'never' })}
        />
        Never
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="radio"
          name="recurrence-end"
          className={radioClass}
          checked={end.mode === 'until'}
          onChange={() => onChange({ ...end, mode: 'until', until: end.until || minDate || today })}
        />
        On
        <input
          type="date"
          aria-label="End date"
          value={end.until}
          min={minDate ?? undefined}
          disabled={end.mode !== 'until'}
          onChange={(e) => onChange({ ...end, mode: 'until', until: e.target.value })}
          className={`${inputClass} flex-1 min-w-0`}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="radio"
          name="recurrence-end"
          className={radioClass}
          checked={end.mode === 'count'}
          onChange={() => onChange({ ...end, mode: 'count' })}
        />
        After
        <input
          type="number"
          aria-label="Occurrence count"
          min={1}
          max={999}
          value={end.count}
          disabled={end.mode !== 'count'}
          onChange={(e) => onChange({ ...end, mode: 'count', count: Number(e.target.value) })}
          className={`${inputClass} w-16`}
        />
        times
      </label>
    </fieldset>
  );
}

type View = 'presets' | 'custom' | 'end';

export function RecurrencePicker({ currentRrule, startDate, onSet, onRemove }: RecurrencePickerProps) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('presets');
  const [customFreq, setCustomFreq] = useState('WEEKLY');
  const [customInterval, setCustomInterval] = useState(1);
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [end, setEnd] = useState<RecurrenceEnd>({ mode: 'never', until: '', count: 10 });
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const current = currentRrule ? splitRrule(currentRrule) : null;

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
        setView('presets');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    setView('presets');
  };

  const handleToggle = () => {
    if (!open) {
      // Seed the editors from the current rule each time the dropdown opens
      setEnd(current?.end ?? { mode: 'never', until: '', count: 10 });
      if (current) {
        setCustomFreq(current.base.match(/FREQ=(\w+)/)?.[1] ?? 'WEEKLY');
        setCustomInterval(parseInt(current.base.match(/INTERVAL=(\d+)/)?.[1] ?? '1', 10));
        setCustomDays(current.base.match(/BYDAY=([^;]+)/)?.[1]?.split(',') ?? []);
      }
      setView('presets');
    }
    setOpen(!open);
  };

  // Changing the pattern keeps whatever end condition the series already has
  const handlePreset = (rrule: string) => {
    onSet(current ? withEnd(rrule, current.end) : rrule);
    close();
  };

  const handleCustomSubmit = () => {
    let rrule = `FREQ=${customFreq}`;
    if (customInterval > 1) rrule += `;INTERVAL=${customInterval}`;
    if (customFreq === 'WEEKLY' && customDays.length > 0) {
      rrule += `;BYDAY=${customDays.join(',')}`;
    }
    onSet(withEnd(rrule, end));
    close();
  };

  const handleEndSubmit = () => {
    if (!current) return;
    onSet(withEnd(current.base, end));
    close();
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

  const endInvalid = (end.mode === 'until' && !end.until)
    || (end.mode === 'count' && (!Number.isFinite(end.count) || end.count < 1));

  const actionButtons = (onSave: () => void) => (
    <div className="flex gap-2">
      <button
        onClick={onSave}
        disabled={endInvalid}
        className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={close}
        className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
      >
        Cancel
      </button>
    </div>
  );

  const endSummary = current ? (endToHuman(current.end, locale) || 'never') : '';

  const dropdown = (
    <div
      style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-60"
      onMouseDown={e => e.stopPropagation()}
    >
      {view === 'presets' && (
        <div className="py-1">
          {PRESETS.map(preset => (
            <button
              key={preset.rrule}
              onClick={() => handlePreset(preset.rrule)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                current?.base === preset.rrule ? 'text-blue-600 dark:text-gray-100 font-medium' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <div className="border-t border-gray-100 dark:border-gray-700 my-1" />
          <button
            onClick={() => setView('custom')}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Custom...
          </button>
          {current && (
            <button
              onClick={() => setView('end')}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Ends: <span className="text-gray-500 dark:text-gray-400">{endSummary}</span>
            </button>
          )}
        </div>
      )}

      {view === 'custom' && (
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

          <div className="border-t border-gray-100 dark:border-gray-700" />
          <EndEditor end={end} onChange={setEnd} minDate={startDate} />

          {actionButtons(handleCustomSubmit)}
        </div>
      )}

      {view === 'end' && (
        <div className="p-3 space-y-3">
          <EndEditor end={end} onChange={setEnd} minDate={startDate} />
          {actionButtons(handleEndSubmit)}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          ref={buttonRef}
          onClick={handleToggle}
          className={`flex items-center gap-2 text-sm px-2 py-1 rounded border transition-colors ${
            currentRrule
              ? 'border-blue-300 dark:border-gray-500 text-blue-600 dark:text-gray-100 bg-blue-50 dark:bg-gray-700/50'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Repeat size={14} />
          {currentRrule ? rruleToHuman(currentRrule, locale) : 'Repeat'}
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
