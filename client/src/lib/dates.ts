import { format, intervalToDuration, isToday, isTomorrow, isYesterday, parseISO, type Locale } from 'date-fns';

export function formatDueDate(dateStr: string | null, locale: Locale): string {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'P', { locale });
}

export function dueDateColor(dateStr: string | null): string {
  if (!dateStr) return 'text-gray-400';
  const date = parseISO(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date < today) return 'text-red-500';
  if (isToday(date)) return 'text-blue-500';
  if (isTomorrow(date)) return 'text-orange-500';
  return 'text-gray-500';
}

export function formatDueTime(dueDateTimeUtc: string | null, locale: Locale): string {
  if (!dueDateTimeUtc) return '';
  const normalized = /[Z+\-]\d*$/.test(dueDateTimeUtc) ? dueDateTimeUtc : dueDateTimeUtc + 'Z';
  return format(new Date(normalized), 'p', { locale });
}

export const DEFAULT_COUNTDOWN_PRECISION = 2;

const COUNTDOWN_UNITS = [
  { key: 'years',   label: (n: number) => ` yr${n !== 1 ? 's' : ''}` },
  { key: 'months',  label: (n: number) => ` mo${n !== 1 ? 's' : ''}` },
  { key: 'weeks',   label: (n: number) => ` wk${n !== 1 ? 's' : ''}` },
  { key: 'days',    label: (n: number) => ` day${n !== 1 ? 's' : ''}` },
  { key: 'hours',   label: () => 'h' },
  { key: 'minutes', label: () => 'm' },
] as const;

/**
 * Formats the gap between two instants as "in X unit Y unit", showing the
 * `precision` largest non-zero units. Uses calendar math (date-fns), so months
 * and years respect real month lengths. Weeks are carved out of the day remainder.
 */
export function formatCountdown(start: Date, end: Date, precision: number, includeTime: boolean): string {
  const d = intervalToDuration({ start, end });
  const days = d.days ?? 0;
  const values: Record<(typeof COUNTDOWN_UNITS)[number]['key'], number> = {
    years: d.years ?? 0,
    months: d.months ?? 0,
    weeks: Math.floor(days / 7),
    days: days % 7,
    hours: includeTime ? d.hours ?? 0 : 0,
    minutes: includeTime ? d.minutes ?? 0 : 0,
  };
  const parts = COUNTDOWN_UNITS
    .filter(u => values[u.key] > 0)
    .slice(0, Math.max(1, precision))
    .map(u => `${values[u.key]}${u.label(values[u.key])}`);
  return parts.length ? `in ${parts.join(' ')}` : 'in 0m';
}

export function formatTimeUntilDue(
  dueDate: string | null,
  dueDateTime: string | null,
  precision: number = DEFAULT_COUNTDOWN_PRECISION,
): string | null {
  if (!dueDate) return null;

  if (dueDateTime) {
    const normalized = /[Z+\-]\d*$/.test(dueDateTime) ? dueDateTime : dueDateTime + 'Z';
    const target = new Date(normalized);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs < 0) return 'Overdue';
    if (diffMs === 0) return 'Today';
    return formatCountdown(now, target, precision, true);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = parseISO(dueDate);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0)  return 'Overdue';
  if (diffDays === 0) return 'Today';
  return formatCountdown(today, target, precision, false);
}

export function groupByDate(dateStr: string, locale: Locale): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, P', { locale });
}
