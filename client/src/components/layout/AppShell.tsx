import { useState } from 'react';
import { Outlet } from 'react-router';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { DragDropProvider } from '@dnd-kit/react';
import { moveTask } from '../../api/tasks';
import { toast } from 'sonner';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleDragEnd = async (event: { operation: { source?: { id?: string | number } | null; target?: { id?: string | number } | null } }) => {
    const { source, target } = event.operation;
    if (!source?.id || !target?.id) return;
    const targetId = String(target.id);
    if (!targetId.startsWith('project-drop-')) return;
    const projectId = targetId.replace('project-drop-', '');
    try {
      await moveTask(String(source.id), projectId);
    } catch {
      toast.error('Failed to move task');
    }
  };

  return (
    <DragDropProvider onDragEnd={handleDragEnd}>
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-900">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
          >
            <Menu size={24} />
          </button>
          <h1 className="ml-3 text-lg font-semibold text-gray-900 dark:text-white">Postpone</h1>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
    </DragDropProvider>
  );
}
