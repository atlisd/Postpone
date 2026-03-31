import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSignalR } from '../../hooks/useSignalR';
import { listProjects, createProject, deleteProject, reorderProjects, updateProject } from '../../api/projects';
import { listTags, createTag, updateTag, deleteTag } from '../../api/tags';
import { ProjectFormModal } from '../projects/ProjectFormModal';
import { TagFormModal } from '../tags/TagFormModal';
import type { ProjectResponse, TagFull } from '../../types/api';
import { useDroppable, useDragDropMonitor, useDragOperation } from '@dnd-kit/react';
import { useSortable, isSortableOperation } from '@dnd-kit/react/sortable';
import {
  Sun,
  Sunrise,
  Calendar,
  List,
  Users,
  X,
  Plus,
  FolderOpen,
  MoreHorizontal,
  Trash2,
  Pencil,
  UserCheck,
  GripVertical,
  ChevronDown,
  SquareCheck,
  CalendarDays,
  User,
} from 'lucide-react';
import { toast } from 'sonner';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  desktopVisible?: boolean;
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
  index: number;
  userId: string | undefined;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
  onContextMenu: (projectId: string, rect: DOMRect) => void;
  contextMenuProjectId: string | null;
  taskCount: number;
}

function SortableProjectItem({
  project,
  index,
  userId,
  navLinkClass,
  onClose,
  onContextMenu,
  contextMenuProjectId,
  taskCount,
}: SortableProjectItemProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: project.id,
    index,
    group: 'sidebar-projects',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accept: (draggable: any) => draggable?.group === 'sidebar-projects',
  });
  const { ref: dropRef, isDropTarget } = useDroppable({ id: 'project-drop-' + project.id });
  const { source } = useDragOperation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDraggingProject = (source as any)?.group === 'sidebar-projects';

  return (
    <div ref={dropRef} className={`rounded-md ${isDropTarget && !isDraggingProject ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
    <div ref={ref} className={`relative group ${isDragging ? 'opacity-50' : ''}`}>
      <NavLink
        to={`/app/projects/${project.id}`}
        className={navLinkClass}
        onClick={(e) => { if (dragOccurred) { e.preventDefault(); return; } onClose(); }}
      >
        <span
          ref={handleRef}
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
  const { source } = useDragOperation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDraggingProject = (source as any)?.group === 'sidebar-projects';
  return (
    <div ref={ref} className={`relative group rounded-md ${isDropTarget && !isDraggingProject ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
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

export function Sidebar({ open, onClose, desktopVisible = true }: SidebarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; color: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ projectId: string; rect: DOMRect } | null>(null);
  const [tags, setTags] = useState<TagFull[]>([]);
  const [showCreateTagModal, setShowCreateTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TagFull | null>(null);
  const [tagContextMenu, setTagContextMenu] = useState<{ tagId: string; rect: DOMRect } | null>(null);
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

  const fetchTags = useCallback(async () => {
    try {
      const data = await listTags();
      setTags(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchTags(); }, [fetchTags]);
  useEffect(() => { checkNavOverflow(); }, [projects, tags, checkNavOverflow]);

  const fetchAll = useCallback(() => {
    fetchProjects();
    fetchTags();
  }, [fetchProjects, fetchTags]);

  useSignalR(fetchAll);

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

  const handleEditProject = async (data: { name: string; color: string }) => {
    if (!editingProject) return;
    try {
      await updateProject(editingProject.id, { name: data.name, color: data.color });
      setEditingProject(null);
      await fetchProjects();
    } catch {
      toast.error('Failed to update project');
    }
  };

  const handleCreateTag = async (data: { name: string; color: string }) => {
    try {
      await createTag(data);
      setShowCreateTagModal(false);
      await fetchTags();
    } catch {
      toast.error('Failed to create tag');
    }
  };

  const handleEditTagSubmit = async (data: { name: string; color: string }) => {
    if (!editingTag) return;
    try {
      await updateTag(editingTag.id, data);
      setEditingTag(null);
      await fetchTags();
    } catch {
      toast.error('Failed to update tag');
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    if (!confirm(`Delete tag "${name}"? It will be removed from all tasks.`)) return;
    try {
      await deleteTag(id);
      setTagContextMenu(null);
      if (location.pathname.includes(`/app/tags/${id}`)) {
        navigate('/app/today', { replace: true });
      }
      await fetchTags();
    } catch {
      toast.error('Failed to delete tag');
    }
  };

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  useDragDropMonitor({
    onDragStart() {
      dragOccurred = true;
    },
    onDragEnd(event) {
      // Clear the drag flag after a tick so it's still true when the post-drag click fires.
      setTimeout(() => { dragOccurred = false; }, 0);

      const { operation } = event;
      if (!isSortableOperation(operation)) return;
      const { source, target } = operation;
      if (!source || !target) return;
      if (source.group !== 'sidebar-projects' || target.group !== 'sidebar-projects') return;
      const fromIndex = source.initialIndex;
      const toIndex = source.index;
      if (fromIndex === toIndex) return;

      const current = projectsRef.current;
      const sortable = current.filter(p => !p.isInbox);
      const inbox = current.find(p => p.isInbox);

      const reordered = [...sortable];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      // Invalidate any in-flight fetchProjects so the optimistic update isn't overwritten
      fetchVersionRef.current++;
      setProjects(inbox ? [inbox, ...reordered] : reordered);

      reorderProjects(reordered.map(p => p.id)).catch(() => {
        toast.error('Failed to save order');
        fetchProjects();
      });
    },
  });

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-blue-100 dark:bg-gray-700 text-blue-700 dark:text-gray-100 font-medium'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
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
        className={`fixed top-0 left-0 h-full w-60 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-50 flex flex-col transition-transform duration-200 md:translate-x-0 md:static md:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${!desktopVisible ? 'md:hidden' : ''}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Postpone</h1>
          <button onClick={onClose} className="md:hidden text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>

        {/* Mobile icon row */}
        <div className="md:hidden flex items-center gap-1 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          {(() => {
            const taskRoutes = ['/app/today', '/app/tomorrow', '/app/next7days', '/app/all', '/app/assigned', '/app/projects/'];
            const isTasksActive = taskRoutes.some(r => location.pathname.startsWith(r));
            const isCalendarActive = location.pathname === '/app/calendar';
            const isSettingsActive = location.pathname === '/app/settings';
            const iconBtn = (active: boolean) =>
              `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${active ? 'bg-blue-100 dark:bg-gray-700 text-blue-700 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`;
            return (
              <>
                <button onClick={() => { navigate('/app/settings'); onClose(); }} className={iconBtn(isSettingsActive)} title="Settings">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user?.displayName} className="w-7 h-7 rounded-full object-cover" />
                  ) : user?.displayName ? (
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${isSettingsActive ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                      {user.displayName[0].toUpperCase()}
                    </span>
                  ) : (
                    <User size={18} />
                  )}
                </button>
                <button onClick={() => { navigate('/app/today'); onClose(); }} className={iconBtn(isTasksActive)} title="Tasks">
                  <SquareCheck size={20} />
                </button>
                <button onClick={() => { navigate('/app/calendar'); onClose(); }} className={iconBtn(isCalendarActive)} title="Calendar">
                  <CalendarDays size={20} />
                </button>
              </>
            );
          })()}
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
              {sortableProjects.map((project, index) => (
                <SortableProjectItem
                  key={project.id}
                  project={project}
                  index={index}
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
            </>
          )}

          {/* Tags — only shown when at least one tag has active tasks */}
          {tags.some(t => t.taskCount > 0) && (
            <>
          <div className="my-3 border-t border-gray-200 dark:border-gray-700" />
          <div className="flex items-center justify-between px-3 py-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Tags
            </p>
            <button
              onClick={() => setShowCreateTagModal(true)}
              className="text-gray-400 hover:text-blue-500 transition-colors"
              title="New tag"
            >
              <Plus size={16} />
            </button>
          </div>
            {tags.filter(t => t.taskCount > 0).map(tag => (
              <div key={tag.id} className="relative group/tag flex items-center">
                <NavLink
                  to={`/app/tags/${tag.id}`}
                  className={({ isActive }) => navLinkClass({ isActive }) + ' flex-1 pr-7'}
                  onClick={onClose}
                >
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="flex-1 truncate">{tag.name}</span>
                  <span className="text-xs text-gray-400">{tag.taskCount}</span>
                </NavLink>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTagContextMenu(tagContextMenu?.tagId === tag.id ? null : { tagId: tag.id, rect });
                    setContextMenu(null);
                  }}
                  className={`absolute right-1 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover/tag:opacity-100 transition-opacity ${tagContextMenu?.tagId === tag.id ? 'opacity-100' : ''}`}
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            ))}
            </>
          )}
        </nav>
        {navOverflows && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 flex items-end justify-center pb-1 bg-gradient-to-t from-white dark:from-gray-900 to-transparent">
            <ChevronDown size={16} className="text-gray-400 dark:text-gray-500" />
          </div>
        )}
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
                if (project) {
                  setEditingProject({ id: project.id, name: project.name, color: project.color });
                  setContextMenu(null);
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Pencil size={14} />
              Edit
            </button>
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

      {editingProject && (
        <ProjectFormModal
          onClose={() => setEditingProject(null)}
          onSubmit={handleEditProject}
          initial={{ name: editingProject.name, color: editingProject.color }}
        />
      )}

      {tagContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setTagContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]"
            style={{ top: tagContextMenu.rect.bottom + 4, left: tagContextMenu.rect.left }}
          >
            <button
              onClick={() => {
                const tag = tags.find(t => t.id === tagContextMenu.tagId);
                if (tag) { setEditingTag(tag); setTagContextMenu(null); }
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Pencil size={14} />
              Edit
            </button>
            <button
              onClick={() => {
                const tag = tags.find(t => t.id === tagContextMenu.tagId);
                if (tag) handleDeleteTag(tag.id, tag.name);
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

      {showCreateTagModal && (
        <TagFormModal
          onClose={() => setShowCreateTagModal(false)}
          onSubmit={handleCreateTag}
        />
      )}

      {editingTag && (
        <TagFormModal
          onClose={() => setEditingTag(null)}
          onSubmit={handleEditTagSubmit}
          initial={{ name: editingTag.name, color: editingTag.color }}
        />
      )}
    </>
  );
}
