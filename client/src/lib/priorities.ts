export const PRIORITIES = [
  { value: 0, label: 'None', color: 'text-gray-400', bg: '' },
  { value: 1, label: 'Low', color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-gray-800' },
  { value: 2, label: 'Medium', color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { value: 3, label: 'High', color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
] as const;

export function getPriority(value: number) {
  return PRIORITIES[value] ?? PRIORITIES[0];
}

export function priorityFlag(value: number): string {
  if (value === 0) return '';
  if (value === 1) return '!';
  if (value === 2) return '!!';
  return '!!!';
}
