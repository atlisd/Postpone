import { useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { IconSidebar } from './IconSidebar';
import { ConnectionStatus } from '../shared/ConnectionStatus';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type DragEndEvent,
} from '@dnd-kit/core';
import { moveTask } from '../../api/tasks';
import { toast } from 'sonner';

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const showSidebar = ['/app/today', '/app/tomorrow', '/app/next7days', '/app/all', '/app/assigned', '/app/priority', '/app/projects/', '/app/tags/']
    .some(r => location.pathname.startsWith(r));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.data.current?.type !== 'task-item') return;
    const overType = over.data.current?.type;
    // Both 'project-drop' (Inbox) and 'sidebar-project' (sortable) accept task drops.
    if (overType !== 'project-drop' && overType !== 'sidebar-project') return;

    const projectId = over.data.current?.projectId as string | undefined;
    const projectName = (over.data.current?.projectName as string) ?? '';
    if (!projectId) return;
    const sourceId = String(active.id);

    // Hide the dragged element immediately to prevent the snap-back animation.
    // Skip this for smart list views: the task stays in the list after the move
    // (due date unchanged), so React reuses the same DOM element and opacity:0 persists.
    const isSmartList = ['/app/today', '/app/tomorrow', '/app/next7days', '/app/all', '/app/assigned', '/app/priority']
      .some(r => location.pathname.startsWith(r));
    const el = !isSmartList
      ? (document.querySelector(`[data-task-drag-id="${CSS.escape(sourceId)}"]`) as HTMLElement | null)
      : null;
    if (el) {
      el.style.transition = 'none';
      el.style.opacity = '0';
    }
    // active.id is compound "taskUuid_occurrenceDate|single" — extract just the UUID
    const taskId = sourceId.split('_')[0];
    try {
      await moveTask(taskId, projectId);
      toast(`Task moved to ${projectName}`);
    } catch {
      toast.error('Failed to move task');
      if (el) {
        el.style.transition = '';
        el.style.opacity = '';
      }
    }
  }, [location.pathname]);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <ConnectionStatus />
      <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
        <IconSidebar />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} desktopVisible={showSidebar} />

        <main className="flex-1 flex flex-col min-w-0">
          {/* Mobile header — always visible so the user can navigate from any route */}
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
    </DndContext>
  );
}
