import { useCallback, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { IconSidebar } from './IconSidebar';
import { ConnectionStatus } from '../shared/ConnectionStatus';
import { useAuth } from '../../contexts/AuthContext';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { moveTask } from '../../api/tasks';
import { toast } from 'sonner';

// Sidebar uses one DndContext with nested SortableContexts (top-level + per-folder).
// Plain pointerWithin lets `over` resolve to items in a *different* container than
// `active` — e.g. dragging within Folder B can resolve to a child of Folder A or to
// Folder A's header. That is what caused projects to "pop out" of folders and the
// visual reorder to jump as the cursor drifted across container boundaries.
//
// Filter the droppable set per active source so collisions can only land on
// targets that make sense for that source:
//   - sidebar-project: same-container projects (reorder), folder headers (merge),
//     folder dropzones (add to folder), and Inbox project-drop. Cross-container
//     project moves go through dropzones / merge intent, not cross-context drift.
//   - sidebar-folder: only top-level items (folders never enter folders).
//   - task-item / anything else: no filtering.
const sidebarSmartCollision: CollisionDetection = (args) => {
  const activeData = args.active?.data?.current as
    | { type?: string; container?: string }
    | undefined;
  const activeType = activeData?.type;
  const activeContainer = activeData?.container;

  if (activeType !== 'sidebar-project' && activeType !== 'sidebar-folder') {
    return pointerWithin(args);
  }

  const filtered = args.droppableContainers.filter((c) => {
    const d = c.data?.current as { type?: string; container?: string } | undefined;
    if (!d?.type) return false;
    if (activeType === 'sidebar-folder') {
      return d.type === 'sidebar-folder' || d.type === 'sidebar-project'
        ? d.container === 'toplevel'
        : false;
    }
    if (d.type === 'sidebar-folder') return true;
    if (d.type === 'folder-dropzone') return true;
    if (d.type === 'project-drop') return true;
    if (d.type === 'sidebar-project') {
      // Always allow same-container project drops (reorder).
      if (d.container === activeContainer) return true;
      // Allow drops onto top-level projects from anywhere (move out of folder, or
      // top-level reorder targets). Block project drops onto a *different* folder's
      // child — those should go through the dropzone or merge intent, not collision
      // drift, which used to cause the "jumping" inside a folder.
      return d.container === 'toplevel';
    }
    return false;
  });

  return pointerWithin({ ...args, droppableContainers: filtered });
};

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
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
    <DndContext sensors={sensors} collisionDetection={sidebarSmartCollision} onDragEnd={handleDragEnd}>
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
            <h1 className="ml-3 text-lg font-semibold text-gray-900 dark:text-white">{user?.appName || 'Postpone'}</h1>
          </header>

          <div className="flex-1 overflow-y-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </DndContext>
  );
}
