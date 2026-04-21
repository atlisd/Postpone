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

export function formatTimeUntilDue(dueDate: string | null, dueDateTime: string | null): string | null {
  if (!dueDate) return null;

  const now = new Date();

  if (dueDateTime) {
    const normalized = /[Z+\-]\d*$/.test(dueDateTime) ? dueDateTime : dueDateTime + 'Z';
    const target = new Date(normalized);
    const diffMs = target.getTime() - now.getTime();
    if (diffMs < 0) return 'Overdue';
    if (diffMs === 0) return 'Today';
    const diffMins = Math.floor(diffMs / 60_000);
    const diffHrs  = Math.floor(diffMs / 3_600_000);
    const diffDays = Math.floor(diffMs / 86_400_000);
    const diffWks  = Math.floor(diffDays / 7);
    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffHrs  < 24) return `in ${diffHrs}h`;
    if (diffDays <  7) return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    return `in ${diffWks} wk${diffWks !== 1 ? 's' : ''}`;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = parseISO(dueDate);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0)  return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays < 7)  return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  const diffWks = Math.floor(diffDays / 7);
  return `in ${diffWks} wk${diffWks !== 1 ? 's' : ''}`;
}

export function groupByDate(dateStr: string, locale: Locale): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, P', { locale });
}
