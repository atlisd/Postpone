import { useState, useEffect, useRef } from 'react';
import { useLocale } from '../../contexts/LocaleContext';

interface LocaleTimeInputProps {
  value: string; // HH:mm or empty
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
}

function formatForDisplay(time: string, localeCode: string, use24Hour: boolean): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return time;
  if (use24Hour) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const date = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat(localeCode, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function parseInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Try HH:mm or H:mm directly
  const timeMatch = trimmed.match(/^(\d{1,2})[:.h](\d{2})$/);
  if (timeMatch) {
    let h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // Try with AM/PM (for en users)
  const ampmMatch = trimmed.match(/^(\d{1,2})[:.h]?(\d{2})?\s*(am|pm|AM|PM)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2] ?? '0', 10);
    const period = ampmMatch[3].toLowerCase();
    if (h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (period === 'am' && h === 12) h = 0;
    else if (period === 'pm' && h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Try bare hour (e.g., "15" or "3pm")
  const bareHourAmpm = trimmed.match(/^(\d{1,2})\s*(am|pm|AM|PM)$/);
  if (bareHourAmpm) {
    let h = parseInt(bareHourAmpm[1], 10);
    const period = bareHourAmpm[2].toLowerCase();
    if (h < 1 || h > 12) return null;
    if (period === 'am' && h === 12) h = 0;
    else if (period === 'pm' && h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:00`;
  }

  const bareHour = trimmed.match(/^(\d{1,2})$/);
  if (bareHour) {
    const h = parseInt(bareHour[1], 10);
    if (h >= 0 && h <= 23) {
      return `${String(h).padStart(2, '0')}:00`;
    }
  }

  return null;
}

function getPlaceholder(use24Hour: boolean): string {
  return use24Hour ? 'hh:mm' : 'hh:mm am';
}

export function LocaleTimeInput({ value, onChange, onBlur, disabled, className }: LocaleTimeInputProps) {
  const { localeCode, use24Hour } = useLocale();
  const [displayValue, setDisplayValue] = useState(() => formatForDisplay(value, localeCode, use24Hour));
  const [editing, setEditing] = useState(false);
  const lastValidRef = useRef(value);

  useEffect(() => {
    if (!editing) {
      setDisplayValue(formatForDisplay(value, localeCode, use24Hour));
      lastValidRef.current = value;
    }
  }, [value, localeCode, use24Hour, editing]);

  const handleFocus = () => {
    setEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayValue(e.target.value);
  };

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseInput(displayValue);
    if (parsed !== null) {
      lastValidRef.current = parsed;
      onChange(parsed);
      setDisplayValue(formatForDisplay(parsed, localeCode, use24Hour));
    } else {
      setDisplayValue(formatForDisplay(lastValidRef.current, localeCode, use24Hour));
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
      placeholder={getPlaceholder(use24Hour)}
      disabled={disabled}
      className={className}
    />
  );
}
