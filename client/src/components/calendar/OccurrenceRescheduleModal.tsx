import type { TaskResponse } from '../../types/api';

interface Props {
  pending: { task: TaskResponse; newDate: string } | null;
  onCancel: () => void;
  onThisOnly: () => void;
  onThisAndFollowing: () => void;
}

export function OccurrenceRescheduleModal({ pending, onCancel, onThisOnly, onThisAndFollowing }: Props) {
  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
          Move Recurring Task
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
          Move only this occurrence, or this one and all following?
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onThisOnly}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors font-medium"
          >
            Only this
          </button>
          <button
            onClick={onThisAndFollowing}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium"
          >
            This and following
          </button>
        </div>
      </div>
    </div>
  );
}
