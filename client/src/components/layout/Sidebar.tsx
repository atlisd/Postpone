import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSignalR } from '../../hooks/useSignalR';
import { listProjects, createProject, deleteProject, reorderProjects } from '../../api/projects';
import { ProjectFormModal } from '../projects/ProjectFormModal';
import type { ProjectResponse } from '../../types/api';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/react';
import {
  Sun,
  Sunrise,
  Calendar,
  List,
  CalendarDays,
  Settings,
  Users,
  LogOut,
  X,
  Plus,
  FolderOpen,
  MoreHorizontal,
  Trash2,
  Home,
  UserCheck,
  GripVertical,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

// Set in onDragStart, cleared after onDragEnd — prevents the post-drag click from
// triggering NavLink navigation when the pointer releases over a project item.
let dragOccurred = false;

const smartLists = [
  { to: '/app/today', label: 'Today', icon: Sun },
  { to: '/app/tomorrow', label: 'Tomorrow', icon: Sunrise },
  { to: '/app/next7days', label: 'Next 7 Days', icon: Calendar },
  { to: '/app/all', label: 'All Tasks', icon: List },
  { to: '/app/assigned', label: 'Assigned to Me', icon: UserCheck },
];

interface SortableProjectItemProps {
  project: ProjectResponse;
  userId: string | undefined;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
  onContextMenu: (projectId: string, rect: DOMRect) => void;
  contextMenuProjectId: string | null;
  taskCount: number;
}

function SortableProjectItem({
  project,
  userId,
  navLinkClass,
  onClose,
  onContextMenu,
  contextMenuProjectId,
  taskCount,
}: SortableProjectItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const { ref: dropRef, isDropTarget } = useDroppable({ id: 'project-drop-' + project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={dropRef} className={`rounded-md ${isDropTarget ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
    <div ref={setNodeRef} style={style} className="relative group">
      <NavLink
        to={`/app/projects/${project.id}`}
        className={navLinkClass}
        onClick={(e) => { if (dragOccurred) { e.preventDefault(); return; } onClose(); }}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing flex-shrink-0"
        >
          <GripVertical size={16} className="hidden group-hover:block text-gray-400" />
          <FolderOpen size={16} style={{ color: project.color }} className="block group-hover:hidden" />
        </span>
        <span className="flex-1 truncate">{project.name}</span>
        {project.householdId && <Users size={12} className="text-gray-400 flex-shrink-0" />}
        <span className="text-xs text-gray-400 group-hover:invisible">
          {taskCount}
        </span>
      </NavLink>
      {project.ownerId === userId && (
        <button
          onClick={(e) => {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            onContextMenu(project.id, rect);
          }}
          className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500 transition-opacity ${
            contextMenuProjectId === project.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <MoreHorizontal size={14} />
        </button>
      )}
    </div>
    </div>
  );
}

function InboxProjectItem({ project, navLinkClass, onClose }: {
  project: ProjectResponse;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
}) {
  const { ref, isDropTarget } = useDroppable({ id: 'project-drop-' + project.id });
  return (
    <div ref={ref} className={`relative group rounded-md ${isDropTarget ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
      <NavLink to={`/app/projects/${project.id}`} className={navLinkClass} onClick={onClose}>
        <FolderOpen size={16} style={{ color: project.color }} />
        <span className="flex-1 truncate">{project.name}</span>
        <span className="text-xs text-gray-400">
          {project.taskCount - project.completedTaskCount}
        </span>
      </NavLink>
    </div>
  );
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ projectId: string; rect: DOMRect } | null>(null);
  const [navOverflows, setNavOverflows] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const fetchVersionRef = useRef(0);

  const checkNavOverflow = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setNavOverflows(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    checkNavOverflow();
    el.addEventListener('scroll', checkNavOverflow);
    const ro = new ResizeObserver(checkNavOverflow);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', checkNavOverflow); ro.disconnect(); };
  }, [checkNavOverflow]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchProjects = useCallback(async () => {
    const version = ++fetchVersionRef.current;
    try {
      const data = await listProjects();
      if (fetchVersionRef.current === version) {
        setProjects(data);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { checkNavOverflow(); }, [projects, checkNavOverflow]);
  useSignalR(fetchProjects);

  const handleCreateProject = async (data: { name: string; color: string; householdId?: string }) => {
    try {
      const project = await createProject(data);
      setShowCreateModal(false);
      await fetchProjects();
      navigate(`/app/projects/${project.id}`);
    } catch {
      toast.error('Failed to create project');
    }
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}" and all its tasks?`)) return;
    try {
      await deleteProject(id);
      setContextMenu(null);
      if (location.pathname.includes(`/app/projects/${id}`)) {
        navigate('/app/today', { replace: true });
      }
      await fetchProjects();
    } catch {
      toast.error('Failed to delete project');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    // Clear the drag flag after a tick so it's still true when the post-drag click fires.
    setTimeout(() => { dragOccurred = false; }, 0);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sortableProjects = projects.filter(p => !p.isInbox);
    const oldIndex = sortableProjects.findIndex(p => p.id === active.id);
    const newIndex = sortableProjects.findIndex(p => p.id === over.id);
    const reordered = arrayMove(sortableProjects, oldIndex, newIndex);

    const inbox = projects.find(p => p.isInbox);
    // Invalidate any in-flight fetchProjects so the optimistic update isn't overwritten
    fetchVersionRef.current++;
    setProjects(inbox ? [inbox, ...reordered] : reordered);

    try {
      await reorderProjects(reordered.map(p => p.id));
    } catch {
      toast.error('Failed to save order');
      await fetchProjects();
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-blue-100 dark:bg-gray-700 text-blue-700 dark:text-gray-100 font-medium'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  const inboxProject = projects.find(p => p.isInbox);
  const sortableProjects = projects.filter(p => !p.isInbox);

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-50 flex flex-col transition-transform duration-200 md:translate-x-0 md:static md:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Postpone</h1>
          <button onClick={onClose} className="md:hidden text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>

        {/* Smart Lists */}
        <div className="flex-1 relative min-h-0">
        <nav ref={navRef} className="h-full overflow-y-auto px-3 py-3 space-y-1">
          <p className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Smart Lists
          </p>
          {smartLists.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navLinkClass} onClick={onClose}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          <div className="my-3 border-t border-gray-200 dark:border-gray-700" />

          <NavLink to="/app/calendar" className={navLinkClass} onClick={onClose}>
            <CalendarDays size={18} />
            Calendar
          </NavLink>

          <div className="my-3 border-t border-gray-200 dark:border-gray-700" />

          {/* Projects */}
          <div className="flex items-center justify-between px-3 py-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Projects
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-gray-400 hover:text-blue-500 transition-colors"
              title="New project"
            >
              <Plus size={16} />
            </button>
          </div>

          {projects.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500 italic">
              No projects yet
            </p>
          ) : (
            <>
              {/* Inbox — always first, not draggable */}
              {inboxProject && (
                <InboxProjectItem
                  project={inboxProject}
                  navLinkClass={navLinkClass}
                  onClose={onClose}
                />
              )}

              {/* Sortable projects */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={() => { dragOccurred = true; }}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortableProjects.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortableProjects.map(project => (
                    <SortableProjectItem
                      key={project.id}
                      project={project}
                      userId={user?.id}
                      navLinkClass={navLinkClass}
                      onClose={onClose}
                      onContextMenu={(projectId, rect) =>
                        setContextMenu(contextMenu?.projectId === projectId ? null : { projectId, rect })
                      }
                      contextMenuProjectId={contextMenu?.projectId ?? null}
                      taskCount={project.taskCount - project.completedTaskCount}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </>
          )}
        </nav>
        {navOverflows && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 flex items-end justify-center pb-1 bg-gradient-to-t from-white dark:from-gray-900 to-transparent">
            <ChevronDown size={16} className="text-gray-400 dark:text-gray-500" />
          </div>
        )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-1">
          <NavLink to="/app/households" className={navLinkClass} onClick={onClose}>
            <Home size={18} />
            Households
          </NavLink>
          <NavLink to="/app/settings" className={navLinkClass} onClick={onClose}>
            <Settings size={18} />
            Settings
          </NavLink>
          {user?.isAdmin && (
            <NavLink to="/app/admin/users" className={navLinkClass} onClick={onClose}>
              <Users size={18} />
              Admin
            </NavLink>
          )}
          <button
            onClick={() => { logout(); onClose(); }}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 w-full transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]"
            style={{ top: contextMenu.rect.bottom + 4, left: contextMenu.rect.left }}
          >
            <button
              onClick={() => {
                const project = projects.find(p => p.id === contextMenu.projectId);
                if (project) handleDeleteProject(project.id, project.name);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </>,
        document.body
      )}

      {showCreateModal && (
        <ProjectFormModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateProject}
        />
      )}
    </>
  );
}
