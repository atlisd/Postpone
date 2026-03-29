import { useState } from 'react';
import { Plus, CalendarDays, X } from 'lucide-react';
import { format } from 'date-fns';
import { parseNaturalDate } from '../../lib/naturalDate';
import { formatDueDate } from '../../lib/dates';
import { useLocale } from '../../contexts/LocaleContext';

interface AddTaskInputProps {
  onAdd: (title: string, dueDate?: string, dueDateTime?: string) => void;
}

export function AddTaskInput({ onAdd }: AddTaskInputProps) {
  const { locale } = useLocale();
  const [title, setTitle] = useState('');
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const parsedResult = parseNaturalDate(title);
  const showChip = parsedResult !== null && !dismissed;

  const chipLabel = parsedResult
    ? parsedResult.dueDateTime
      ? `${formatDueDate(parsedResult.dueDate, locale)}, ${format(new Date(parsedResult.dueDateTime), 'p', { locale })}`
      : formatDueDate(parsedResult.dueDate, locale)
    : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setDismissed(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showChip && e.key === 'Escape') {
      e.preventDefault();
      setDismissed(true);
      return;
    }
    if (showChip && e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setDismissed(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (parsedResult && !dismissed) {
      onAdd(parsedResult.cleanTitle || title.trim(), parsedResult.dueDate, parsedResult.dueDateTime);
    } else {
      onAdd(title.trim());
    }
    setTitle('');
    setDismissed(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex flex-col border-b transition-colors ${
        focused
          ? 'bg-blue-50/50 dark:bg-gray-800/50 border-blue-200 dark:border-gray-600'
          : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30'
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <Plus size={18} className={focused ? 'text-blue-500' : 'text-gray-400'} />
        <input
          value={title}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add a task..."
          className="flex-1 text-sm bg-transparent text-gray-900 dark:text-white outline-none placeholder-gray-400"
        />
        {title.trim() && (
          <button
            type="submit"
            className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
          >
            Add
          </button>
        )}
      </div>
      {showChip && (
        <div className="flex items-center gap-1.5 px-4 pb-2">
          <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full px-2.5 py-1 font-medium">
            <CalendarDays size={12} />
            <span>{chipLabel}</span>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="ml-0.5 hover:text-blue-900 dark:hover:text-blue-100"
              aria-label="Remove date"
            >
              <X size={10} />
            </button>
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">ESC to remove</span>
        </div>
      )}
    </form>
  );
}
