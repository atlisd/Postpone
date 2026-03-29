import { useState, useEffect, useRef } from 'react';
import { format, parseISO, isValid } from 'date-fns';
import { useLocale } from '../../contexts/LocaleContext';

interface LocaleDateInputProps {
  value: string; // YYYY-MM-DD or empty
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
}

function isMonthFirst(localeCode: string): boolean {
  // Use Intl to detect if locale puts month before day
  const parts = new Intl.DateTimeFormat(localeCode).formatToParts(new Date(2000, 1, 3)); // Feb 3
  const dayIndex = parts.findIndex(p => p.type === 'day');
  const monthIndex = parts.findIndex(p => p.type === 'month');
  return monthIndex < dayIndex;
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

function parseInput(input: string, localeCode: string): string | null {
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
    if (isMonthFirst(localeCode)) {
      [month, day, year] = nums;
    } else {
      [day, month, year] = nums;
    }
  } else if (parts[2].length === 2) {
    const fullYear = nums[2] + (nums[2] < 50 ? 2000 : 1900);
    if (isMonthFirst(localeCode)) {
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

function getPlaceholder(localeCode: string): string {
  // Generate placeholder from locale format
  const parts = new Intl.DateTimeFormat(localeCode).formatToParts(new Date(2000, 0, 1));
  return parts.map(p => {
    if (p.type === 'day') return 'dd';
    if (p.type === 'month') return 'mm';
    if (p.type === 'year') return 'yyyy';
    return p.value;
  }).join('');
}

export function LocaleDateInput({ value, onChange, onBlur, className }: LocaleDateInputProps) {
  const { locale, localeCode } = useLocale();
  const [displayValue, setDisplayValue] = useState(() => formatForDisplay(value, locale));
  const [editing, setEditing] = useState(false);
  const lastValidRef = useRef(value);

  useEffect(() => {
    if (!editing) {
      setDisplayValue(formatForDisplay(value, locale));
      lastValidRef.current = value;
    }
  }, [value, localeCode, locale, editing]);

  const handleFocus = () => {
    setEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  };

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseInput(displayValue, localeCode);
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

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={getPlaceholder(localeCode)}
      className={className}
    />
  );
}
