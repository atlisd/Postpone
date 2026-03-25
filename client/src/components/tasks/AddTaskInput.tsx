import { useState } from 'react';
import { Plus } from 'lucide-react';

interface AddTaskInputProps {
  onAdd: (title: string) => void;
}

export function AddTaskInput({ onAdd }: AddTaskInputProps) {
  const [title, setTitle] = useState('');
  const [focused, setFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim());
    setTitle('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex items-center gap-3 px-4 py-3 border-b transition-colors ${
        focused
          ? 'bg-blue-50/50 dark:bg-gray-800/50 border-blue-200 dark:border-gray-600'
          : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30'
      }`}
    >
      <Plus size={18} className={focused ? 'text-blue-500' : 'text-gray-400'} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
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
    </form>
  );
}
