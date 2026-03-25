import { format, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';

export function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
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

export function groupByDate(dateStr: string): string {
  const date = parseISO(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, MMM d');
}
