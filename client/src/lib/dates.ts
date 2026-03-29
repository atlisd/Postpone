import { format, isToday, isTomorrow, isYesterday, parseISO, type Locale } from 'date-fns';

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

export function groupByDate(dateStr: string, locale: Locale): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, P', { locale });
}
