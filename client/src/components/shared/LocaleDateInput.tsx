import { useState, useEffect, useRef } from 'react';
import { format, parseISO, isValid, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useLocale } from '../../contexts/LocaleContext';

interface LocaleDateInputProps {
  value: string; // YYYY-MM-DD or empty
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
}

function isMonthFirst(locale: import('date-fns').Locale): boolean {
  // Derive day/month order from date-fns (same source as formatForDisplay) rather
  // than Intl.DateTimeFormat. Intl is backed by the OS's ICU data, which disagrees
  // across platforms (e.g. Chrome on Windows vs macOS) for locales like 'is' — that
  // mismatch made typed dates silently swap or revert. date-fns ships its own locale
  // data, so display and parsing stay consistent on every OS.
  // Test date Mar 4 2000: day=4, month=3 are distinct single digits, each appearing
  // once in the 'P' output, so the index comparison is unambiguous.
  const formatted = format(new Date(2000, 2, 4), 'P', { locale });
  return formatted.indexOf('3') < formatted.indexOf('4'); // month before day?
}

function formatForDisplay(isoDate: string, dateFnsLocale: import('date-fns').Locale): string {
  if (!isoDate) return '';
  try {
    const date = parseISO(isoDate);
    if (!isValid(date)) return isoDate;
    return format(date, 'P', { locale: dateFnsLocale });
  } catch {
    return isoDate;
  }
}

function parseInput(input: string, locale: import('date-fns').Locale): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const date = parseISO(trimmed);
    if (isValid(date)) return trimmed;
  }

  // Split by common separators: . / -
  const parts = trimmed.split(/[./\-\s]+/);
  if (parts.length !== 3) return null;

  const nums = parts.map(p => parseInt(p, 10));
  if (nums.some(isNaN)) return null;

  let year: number, month: number, day: number;

  // If first part is 4 digits, it's YYYY-MM-DD
  if (parts[0].length === 4) {
    [year, month, day] = nums;
  } else if (parts[2].length === 4) {
    // Last part is year — determine day/month order from locale
    if (isMonthFirst(locale)) {
      [month, day, year] = nums;
    } else {
      [day, month, year] = nums;
    }
  } else if (parts[2].length === 2) {
    const fullYear = nums[2] + (nums[2] < 50 ? 2000 : 1900);
    if (isMonthFirst(locale)) {
      [month, day] = nums;
    } else {
      [day, month] = nums;
    }
    year = fullYear;
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;

  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = parseISO(iso);
  if (!isValid(check)) return null;

  return iso;
}

function getPlaceholder(locale: import('date-fns').Locale): string {
  // Derive the placeholder from date-fns (same as formatForDisplay) rather than
  // Intl.DateTimeFormat to avoid browser inconsistencies (e.g. Chrome vs Safari
  // disagree on locale behaviour for 'is').
  // Test date: March 4, 2000 — year/month/day are all distinct.
  const formatted = format(new Date(2000, 2, 4), 'P', { locale });
  return formatted
    .replace('2000', 'yyyy')
    .replace('03', 'mm')
    .replace('3', 'mm')
    .replace('04', 'dd')
    .replace('4', 'dd');
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildCalendarDays(viewYear: number, viewMonth: number): (Date | null)[] {
  const firstDay = startOfMonth(new Date(viewYear, viewMonth, 1));
  const lastDay = endOfMonth(firstDay);
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });

  // Pad start with nulls so grid starts on Sunday
  const startPad = getDay(firstDay); // 0=Sunday
  const cells: (Date | null)[] = Array(startPad).fill(null);
  for (const d of days) cells.push(d);

  // Pad end to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

interface CalendarPopupProps {
  value: string;
  onSelect: (iso: string) => void;
  onClose: () => void;
  locale: import('date-fns').Locale;
}

function CalendarPopup({ value, onSelect, onClose, locale }: CalendarPopupProps) {
  const today = new Date();
  const selected = value ? parseISO(value) : null;
  const initial = selected && isValid(selected) ? selected : today;

  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const cells = buildCalendarDays(viewYear, viewMonth);
  const monthLabel = format(new Date(viewYear, viewMonth, 1), 'MMMM yyyy', { locale });

  // Locale-aware weekday headers: Sun Jan 1 2023 was a Sunday
  const weekdayHeaders = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2023, 0, 1 + i); // Jan 1–7, 2023 = Sun–Sat
    return format(d, 'EEEEE', { locale }); // single letter
  });

  function handlePrev() {
    const prev = subMonths(new Date(viewYear, viewMonth, 1), 1);
    setViewYear(prev.getFullYear());
    setViewMonth(prev.getMonth());
  }

  function handleNext() {
    const next = addMonths(new Date(viewYear, viewMonth, 1), 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function handleDayClick(day: Date) {
    onSelect(toIso(day));
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 select-none"
      style={{ minWidth: '240px' }}
      onMouseDown={e => e.preventDefault()} // prevent input blur
    >
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={handlePrev}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          aria-label="Previous month"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{monthLabel}</span>
        <button
          type="button"
          onClick={handleNext}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
          aria-label="Next month"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {weekdayHeaders.map((h, i) => (
          <div key={i} className="text-center text-xs font-medium text-gray-400 dark:text-gray-500 py-0.5">
            {h}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const isSelected = selected && isValid(selected) && isSameDay(day, selected);
          const isTodayDate = isToday(day);
          const isCurrentMonth = day.getMonth() === viewMonth;

          return (
            <button
              key={i}
              type="button"
              onClick={() => handleDayClick(day)}
              className={[
                'text-xs rounded py-1 text-center transition-colors',
                isSelected
                  ? 'bg-blue-500 text-white font-medium'
                  : isTodayDate
                  ? 'text-gray-900 dark:text-white font-bold ring-2 ring-blue-500 dark:ring-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  : isCurrentMonth
                  ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                  : 'text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-750',
              ].join(' ')}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LocaleDateInput({ value, onChange, onBlur, className }: LocaleDateInputProps) {
  const { locale } = useLocale();
  const [displayValue, setDisplayValue] = useState(() => formatForDisplay(value, locale));
  const [editing, setEditing] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const lastValidRef = useRef(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) {
      setDisplayValue(formatForDisplay(value, locale));
      lastValidRef.current = value;
    }
  }, [value, locale, editing]);

  // Close calendar on outside click
  useEffect(() => {
    if (!showCalendar) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showCalendar]);

  const handleFocus = () => {
    setEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  };

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseInput(displayValue, locale);
    if (parsed !== null) {
      lastValidRef.current = parsed;
      onChange(parsed);
      setDisplayValue(formatForDisplay(parsed, locale));
    } else {
      // Revert to last valid
      setDisplayValue(formatForDisplay(lastValidRef.current, locale));
    }
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  function handleCalendarSelect(iso: string) {
    lastValidRef.current = iso;
    onChange(iso);
    setDisplayValue(formatForDisplay(iso, locale));
    setShowCalendar(false);
    onBlur?.();
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-1 flex-1">
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={getPlaceholder(locale)}
        className={className}
        style={{ flex: 1 }}
      />
      <button
        type="button"
        onClick={() => setShowCalendar(s => !s)}
        className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        aria-label="Pick date"
        tabIndex={-1}
      >
        <CalendarDays size={14} />
      </button>
      {showCalendar && (
        <CalendarPopup
          value={value}
          onSelect={handleCalendarSelect}
          onClose={() => setShowCalendar(false)}
          locale={locale}
        />
      )}
    </div>
  );
}
