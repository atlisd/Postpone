import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSignalR } from '../../hooks/useSignalR';
import { listProjects, createProject, deleteProject, updateProject } from '../../api/projects';
import { reorderFolderProjects, reorderTopLevel, listFolders, createFolder, updateFolder, deleteFolder, addProjectToFolder, removeProjectFromFolder, setFolderCollapsed } from '../../api/folders';
import { listTags, createTag, updateTag, deleteTag } from '../../api/tags';
import { updateProfile } from '../../api/auth';
import { getSmartList } from '../../api/tasks';
import { ProjectFormModal } from '../projects/ProjectFormModal';
import { TagFormModal } from '../tags/TagFormModal';
import type { ProjectResponse, ProjectFolderResponse, TagFull } from '../../types/api';
import {
  useDroppable,
  useDndMonitor,
  useDndContext,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Sun,
  Sunrise,
  Calendar,
  List,
  Users,
  X,
  Plus,
  FolderOpen,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Trash2,
  Pencil,
  UserCheck,
  GripVertical,
  ChevronDown,
  ChevronRight,
  SquareCheck,
  CalendarDays,
  User,
  Share2,
  Flag,
  Pin,
} from 'lucide-react';
import { toast } from 'sonner';
import { ProjectShareModal } from '../projects/ProjectShareModal';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  desktopVisible?: boolean;
}

// Set in onDragStart, cleared after onDragEnd — prevents the post-drag click from
// triggering NavLink navigation when the pointer releases over a project item.
let dragOccurred = false;

const smartLists = [
  { to: '/app/today', label: 'Today', icon: Sun, key: 'today' },
  { to: '/app/tomorrow', label: 'Tomorrow', icon: Sunrise, key: 'tomorrow' },
  { to: '/app/next7days', label: 'Next 7 Days', icon: Calendar, key: 'next7days' },
  { to: '/app/all', label: 'All Tasks', icon: List, key: 'all' },
  { to: '/app/priority', label: 'Priority Tasks', icon: Flag, key: 'priority' },
  { to: '/app/assigned', label: 'Assigned to Me', icon: UserCheck, key: 'assigned' },
];

type SidebarTopLevelItem =
  | { type: 'folder'; id: string; sortOrder: number; folder: ProjectFolderResponse }
  | { type: 'project'; id: string; sortOrder: number; project: ProjectResponse };

// ─── SortableProjectItem ─────────────────────────────────────────────────────

interface SortableProjectItemProps {
  project: ProjectResponse;
  container: string; // 'toplevel' or folderId
  userId: string | undefined;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
  onContextMenu: (projectId: string, folderId: string | undefined, rect: DOMRect) => void;
  contextMenuProjectId: string | null;
  taskCount: number;
  onShareClick: (project: ProjectResponse) => void;
  mergeTarget: string | null;
}

function SortableProjectItem({
  project,
  container,
  userId,
  navLinkClass,
  onClose,
  onContextMenu,
  contextMenuProjectId,
  taskCount,
  onShareClick,
  mergeTarget,
}: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: project.id,
    data: {
      type: 'sidebar-project',
      container,
      projectId: project.id,
      projectName: project.name,
      folderId: project.folderId,
    },
  });
  const { active } = useDndContext();
  const activeType = active?.data.current?.type;
  const isTaskHovering = isOver && activeType === 'task-item';
  const isMergeTarget = mergeTarget === project.id;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`rounded-md ${isTaskHovering ? 'ring-2 ring-blue-400 ring-inset' : ''} ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="relative group">
        {isMergeTarget && (
          <div className="absolute inset-0 rounded-md ring-2 ring-dashed ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20 pointer-events-none z-10 flex items-center justify-center">
            <FolderPlus size={14} className="text-blue-500" />
          </div>
        )}
        <NavLink
          to={`/app/projects/${project.id}`}
          className={navLinkClass}
          onClick={(e) => { if (dragOccurred) { e.preventDefault(); return; } onClose(); }}
        >
          <span
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            // preventDefault is essential: this span sits inside the NavLink's <a>.
            // After a drag, the browser synthesizes a click on whatever element is
            // under the pointer; if that element is an icon inside the grip span,
            // stopPropagation alone keeps React Router's onClick from running but
            // the native <a href> still navigates — which the browser commits as a
            // FULL PAGE RELOAD. preventDefault suppresses the native navigation.
            // The same applies to plain (non-drag) clicks on the grip handle.
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <GripVertical size={16} className="hidden group-hover:block text-gray-400" />
            <FolderOpen size={16} style={{ color: project.color }} className="block group-hover:hidden" />
          </span>
          <span className="flex-1 truncate">{project.name}</span>
          {project.householdId && <Users size={12} className="text-gray-400 flex-shrink-0" />}
          {!project.householdId && project.shareCount > 0 && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShareClick(project); }}
              className="text-gray-400 hover:text-blue-500 flex-shrink-0 transition-colors"
              title="Shared project"
            >
              <Share2 size={12} />
            </button>
          )}
          <span className="text-xs text-gray-400 group-hover:invisible">
            {taskCount}
          </span>
        </NavLink>
        {project.ownerId === userId && (
          <button
            onClick={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              onContextMenu(project.id, container === 'toplevel' ? undefined : container, rect);
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

// ─── SortableFolderItem ──────────────────────────────────────────────────────

interface SortableFolderItemProps {
  folder: ProjectFolderResponse;
  mergeTarget: string | null;
  userId: string | undefined;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onFolderContextMenu: (folderId: string, rect: DOMRect) => void;
  folderContextMenuId: string | null;
  onProjectContextMenu: (projectId: string, folderId: string | undefined, rect: DOMRect) => void;
  projectContextMenuId: string | null;
  onShareClick: (project: ProjectResponse) => void;
  onCollapseToggle: (folderId: string, isCollapsed: boolean) => void;
  externalRenameRequest: boolean;
  onExternalRenameHandled: () => void;
}

function SortableFolderItem({
  folder,
  mergeTarget,
  userId,
  navLinkClass,
  onClose,
  onRename,
  onFolderContextMenu,
  folderContextMenuId,
  onProjectContextMenu,
  projectContextMenuId,
  onShareClick,
  onCollapseToggle,
  externalRenameRequest,
  onExternalRenameHandled,
}: SortableFolderItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const folderSortableId = `folder-${folder.id}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: folderSortableId,
    data: {
      type: 'sidebar-folder',
      container: 'toplevel',
      folderId: folder.id,
    },
  });

  // Separate droppable for the folder's children area — accepts projects being added to this folder.
  const { setNodeRef: childrenDropRef, isOver: isChildrenDropTarget } = useDroppable({
    id: `folder-dropzone-${folder.id}`,
    data: { type: 'folder-dropzone', folderId: folder.id },
  });

  const isMergeTarget = mergeTarget === folderSortableId;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (!isRenaming) setRenameValue(folder.name);
  }, [folder.name, isRenaming]);

  useEffect(() => {
    if (externalRenameRequest && !isRenaming) {
      setRenameValue(folder.name);
      setIsRenaming(true);
      onExternalRenameHandled();
    }
  }, [externalRenameRequest, isRenaming, folder.name, onExternalRenameHandled]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== folder.name) {
      onRename(folder.id, trimmed);
    } else {
      setRenameValue(folder.name);
    }
    setIsRenaming(false);
  };

  const incompleteTasks = folder.projects.reduce(
    (sum, p) => sum + (p.taskCount - p.completedTaskCount), 0
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Folder header */}
      <div className={`relative group/folder rounded-md ${isMergeTarget ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/40 dark:bg-blue-900/20' : ''}`}>
        <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-default select-none">
          {/* Drag handle */}
          <span
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={16} className="hidden group-hover/folder:block text-gray-400" />
            {folder.isCollapsed
              ? <Folder size={16} className="block group-hover/folder:hidden text-gray-400 dark:text-gray-500" />
              : <FolderOpen size={16} className="block group-hover/folder:hidden text-gray-400 dark:text-gray-500" />
            }
          </span>

          {/* Collapse toggle + name */}
          <button
            className="flex items-center gap-1 flex-1 min-w-0 text-left"
            onClick={() => {
              if (!isRenaming) onCollapseToggle(folder.id, !folder.isCollapsed);
            }}
          >
            {isRenaming ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                  if (e.key === 'Escape') { setRenameValue(folder.name); setIsRenaming(false); }
                }}
                onClick={e => e.stopPropagation()}
                className="flex-1 min-w-0 bg-white dark:bg-gray-700 border border-blue-400 rounded px-1 py-0.5 text-sm text-gray-900 dark:text-white outline-none"
              />
            ) : (
              <span
                className="flex-1 truncate font-medium"
                onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
              >
                {folder.name}
              </span>
            )}
            {!isRenaming && (
              folder.isCollapsed
                ? <ChevronRight size={14} className="flex-shrink-0 text-gray-400" />
                : <ChevronDown size={14} className="flex-shrink-0 text-gray-400" />
            )}
          </button>

          {!isRenaming && (
            <span className="text-xs text-gray-400 group-hover/folder:invisible flex-shrink-0">
              {incompleteTasks > 0 ? incompleteTasks : ''}
            </span>
          )}
        </div>

        {/* Context menu button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onFolderContextMenu(folder.id, rect);
          }}
          className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500 transition-opacity ${
            folderContextMenuId === folder.id ? 'opacity-100' : 'opacity-0 group-hover/folder:opacity-100'
          }`}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Folder contents */}
      {!folder.isCollapsed && (
        <div
          ref={childrenDropRef}
          className={`ml-3 border-l border-gray-200 dark:border-gray-700 pl-1 mt-0.5 space-y-0.5 min-h-[8px] rounded-md ${
            isChildrenDropTarget && folder.projects.length === 0 ? 'ring-2 ring-dashed ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20' : ''
          }`}
        >
          {(() => {
            // Dedupe defensively — a stale optimistic write that left the same
            // project in two folders would otherwise produce duplicate React keys
            // inside the SortableContext and blank the sidebar.
            const seen = new Set<string>();
            const uniqueProjects = folder.projects.filter(p => {
              if (seen.has(p.id)) return false;
              seen.add(p.id);
              return true;
            });
            return (
              <SortableContext
                items={uniqueProjects.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {uniqueProjects.map(project => (
                  <SortableProjectItem
                    key={project.id}
                    project={project}
                    container={folder.id}
                    userId={userId}
                    navLinkClass={navLinkClass}
                    onClose={onClose}
                    onContextMenu={onProjectContextMenu}
                    contextMenuProjectId={projectContextMenuId}
                    taskCount={project.taskCount - project.completedTaskCount}
                    onShareClick={onShareClick}
                    mergeTarget={mergeTarget}
                  />
                ))}
              </SortableContext>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── InboxProjectItem ────────────────────────────────────────────────────────

function InboxProjectItem({ project, navLinkClass, onNavClick }: {
  project: ProjectResponse;
  navLinkClass: (props: { isActive: boolean }) => string;
  onNavClick: (e: React.MouseEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'project-drop-' + project.id,
    data: {
      type: 'project-drop',
      projectId: project.id,
      projectName: project.name,
    },
  });
  const { active } = useDndContext();
  const isTaskHovering = isOver && active?.data.current?.type === 'task-item';

  return (
    <div
      ref={setNodeRef}
      className={`relative group rounded-md ${isTaskHovering ? 'ring-2 ring-blue-400 ring-inset' : ''}`}
    >
      <NavLink to={`/app/projects/${project.id}`} className={navLinkClass} onClick={onNavClick}>
        <FolderOpen size={16} style={{ color: project.color }} />
        <span className="flex-1 truncate">{project.name}</span>
        <span className="text-xs text-gray-400">
          {project.taskCount - project.completedTaskCount}
        </span>
      </NavLink>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({ open, onClose, desktopVisible = true }: SidebarProps) {
  const { user, gravatarUrl, refreshUser } = useAuth();
  const [gravatarFailed, setGravatarFailed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [folders, setFolders] = useState<ProjectFolderResponse[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<{ id: string; name: string; color: string } | null>(null);
  const [sharingProject, setSharingProject] = useState<ProjectResponse | null>(null);
  const [contextMenu, setContextMenu] = useState<{ projectId: string; folderId?: string; rect: DOMRect } | null>(null);
  const [folderContextMenu, setFolderContextMenu] = useState<{ folderId: string; rect: DOMRect } | null>(null);
  const [tags, setTags] = useState<TagFull[]>([]);
  const [showCreateTagModal, setShowCreateTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TagFull | null>(null);
  const [tagContextMenu, setTagContextMenu] = useState<{ tagId: string; rect: DOMRect } | null>(null);
  const [pinContextMenu, setPinContextMenu] = useState<{ type: 'project' | 'tag'; id: string; rect: DOMRect } | null>(null);
  const [hasAssignedTasks, setHasAssignedTasks] = useState<boolean | null>(null);
  const [smartListCounts, setSmartListCounts] = useState<Record<string, number>>({});
  const [navOverflows, setNavOverflows] = useState(false);
  const [smartListsCollapsed, setSmartListsCollapsed] = useState(
    () => localStorage.getItem('sidebar_smartlists_collapsed') === 'true'
  );
  const [projectsCollapsed, setProjectsCollapsed] = useState(
    () => localStorage.getItem('sidebar_projects_collapsed') === 'true'
  );
  const [tagsCollapsed, setTagsCollapsed] = useState(
    () => localStorage.getItem('sidebar_tags_collapsed') === 'true'
  );
  const toggleSmartLists = () => setSmartListsCollapsed(v => { const n = !v; localStorage.setItem('sidebar_smartlists_collapsed', String(n)); return n; });
  const toggleProjects = () => setProjectsCollapsed(v => { const n = !v; localStorage.setItem('sidebar_projects_collapsed', String(n)); return n; });
  const toggleTags = () => setTagsCollapsed(v => { const n = !v; localStorage.setItem('sidebar_tags_collapsed', String(n)); return n; });
  // Merge intent state for drag-to-create folder / drag-onto-folder-header
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [folderRenaming, setFolderRenaming] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  // Shared barrier: bumped by optimistic mutations to invalidate in-flight fetches
  // that started before the mutation. Fetches snapshot its value at start and
  // skip applying their result if it's moved on.
  const fetchVersionRef = useRef(0);
  // Per-kind fetch counters: dedupe concurrent fetches of the SAME kind so only
  // the latest setState wins. Necessary because fetchAll() runs all four in
  // parallel — a shared counter would invalidate all but the last to bump.
  const projectsFetchRef = useRef(0);
  const foldersFetchRef = useRef(0);
  const tagsFetchRef = useRef(0);
  const assignedFetchRef = useRef(0);

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
    const barrier = fetchVersionRef.current;
    const mine = ++projectsFetchRef.current;
    try {
      const data = await listProjects();
      if (fetchVersionRef.current === barrier && projectsFetchRef.current === mine) {
        setProjects(data);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    const barrier = fetchVersionRef.current;
    const mine = ++foldersFetchRef.current;
    try {
      const data = await listFolders();
      if (fetchVersionRef.current === barrier && foldersFetchRef.current === mine) {
        setFolders(data);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchTags = useCallback(async () => {
    const barrier = fetchVersionRef.current;
    const mine = ++tagsFetchRef.current;
    try {
      const data = await listTags();
      if (fetchVersionRef.current === barrier && tagsFetchRef.current === mine) {
        setTags(data);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchAssignedCount = useCallback(async () => {
    const barrier = fetchVersionRef.current;
    const mine = ++assignedFetchRef.current;
    try {
      const [today, tomorrow, next7days, allTasks, priorityTasks, assigned] = await Promise.all([
        getSmartList('today'),
        getSmartList('tomorrow'),
        getSmartList('next7days'),
        user?.showAllTasksList ? getSmartList('all') : Promise.resolve([]),
        user?.showPriorityTasksList ? getSmartList('priority') : Promise.resolve([]),
        getSmartList('assigned-to-me'),
      ]);
      if (fetchVersionRef.current !== barrier || assignedFetchRef.current !== mine) return;
      setHasAssignedTasks(assigned.length > 0);
      setSmartListCounts({
        today: today.length,
        tomorrow: tomorrow.length,
        next7days: next7days.length,
        all: allTasks.length,
        priority: priorityTasks.length,
        assigned: assigned.length,
      });
    } catch {
      if (fetchVersionRef.current === barrier && assignedFetchRef.current === mine) {
        setHasAssignedTasks(null);
      }
    }
  }, [user?.showAllTasksList, user?.showPriorityTasksList]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchFolders(); }, [fetchFolders]);
  useEffect(() => { fetchTags(); }, [fetchTags]);
  useEffect(() => { fetchAssignedCount(); }, [fetchAssignedCount]);
  useEffect(() => { checkNavOverflow(); }, [projects, folders, tags, checkNavOverflow]);

  // Suppress the post-drag synthesized click at the document level.
  //
  // Why this exists: @dnd-kit/core's PointerSensor adds its own document-level
  // capture-phase click listener at drag start that calls *only* event.stopPropagation()
  // (see node_modules/@dnd-kit/core/dist/core.esm.js — `stopPropagation` is added on
  // EventName.Click with { capture: true }, and removed 50ms after pointerup). Stopping
  // propagation prevents React's delegated onClick from ever firing — so the per-NavLink
  // `if (dragOccurred) e.preventDefault()` guards never run after a real drag. The native
  // <a href> default action then commits as a *full page reload*, which is what the user
  // sees as "the page reloads when dragging projects up".
  //
  // Registering at Sidebar mount means our capture-phase listener runs *before* dnd-kit's
  // (capture-phase listeners fire in registration order). preventDefault here is enough —
  // the native <a> navigation is the only side effect we still need to suppress.
  useEffect(() => {
    const onCapturedClick = (e: MouseEvent) => {
      if (dragOccurred) e.preventDefault();
    };
    document.addEventListener('click', onCapturedClick, true);
    return () => document.removeEventListener('click', onCapturedClick, true);
  }, []);

  const fetchAll = useCallback(() => {
    fetchProjects();
    fetchFolders();
    fetchTags();
    fetchAssignedCount();
  }, [fetchProjects, fetchFolders, fetchTags, fetchAssignedCount]);

  useSignalR(fetchAll);

  // ── CRUD handlers ──────────────────────────────────────────────────────────

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

  const handleRenameFolder = (id: string, name: string) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
    updateFolder(id, name).catch(() => {
      toast.error('Failed to rename folder');
      fetchFolders();
    });
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Delete this folder? Projects inside will be ungrouped.')) return;
    try {
      await deleteFolder(id);
      setFolderContextMenu(null);
      await fetchAll();
    } catch {
      toast.error('Failed to delete folder');
    }
  };

  const handleCollapseToggle = (folderId: string, isCollapsed: boolean) => {
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isCollapsed } : f));
    setFolderCollapsed(folderId, isCollapsed).catch(() => {
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isCollapsed: !isCollapsed } : f));
      toast.error('Failed to save');
    });
  };

  const handleRemoveFromFolder = async (folderId: string, projectId: string) => {
    try {
      await removeProjectFromFolder(folderId, projectId);
      setContextMenu(null);
      await fetchAll();
    } catch {
      toast.error('Failed to remove from folder');
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

  // ── Drag-drop ──────────────────────────────────────────────────────────────

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  // Derived data
  const inboxProject = projects.find(p => p.isInbox);
  const ungroupedProjects = projects.filter(p => !p.isInbox && p.folderId === null);

  // Top-level items: folders + ungrouped projects, interleaved by sortOrder.
  // Defensive dedupe by id — a malformed optimistic update that left a duplicate
  // would otherwise crash the SortableContext (duplicate React keys = blank page).
  const topLevelItems: SidebarTopLevelItem[] = (() => {
    const seen = new Set<string>();
    const items: SidebarTopLevelItem[] = [];
    for (const f of folders) {
      const id = `folder-${f.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push({ type: 'folder', id, sortOrder: f.sortOrder, folder: f });
    }
    for (const p of ungroupedProjects) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      items.push({ type: 'project', id: p.id, sortOrder: p.sortOrder, project: p });
    }
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  })();

  const topLevelItemsRef = useRef(topLevelItems);
  topLevelItemsRef.current = topLevelItems;

  // Merge-intent state: 1000ms hover on a project or folder header arms a latch
  // that upgrades the drop into "create folder" (project→project) or "add to folder"
  // (project→folder-header). Kept in refs for use inside drag callbacks + a state
  // mirror to trigger the visual dashed-ring re-render.
  const mergeTargetIdRef = useRef<string | null>(null);
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mergeIntentRef = useRef(false);

  const cancelMerge = useCallback(() => {
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    mergeTargetIdRef.current = null;
    mergeIntentRef.current = false;
    setMergeTarget(prev => prev === null ? prev : null);
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const activeType = event.active.data.current?.type;
    if (activeType !== 'sidebar-project' && activeType !== 'sidebar-folder') return;
    dragOccurred = true;
    cancelMerge();
  }, [cancelMerge]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    const activeType = active.data.current?.type;
    if (activeType !== 'sidebar-project') { cancelMerge(); return; }
    if (!over || active.id === over.id) { cancelMerge(); return; }

    const sourceProject = projectsRef.current.find(p => p.id === active.id);
    if (!sourceProject || sourceProject.isInbox || sourceProject.ownerId !== user?.id) {
      cancelMerge();
      return;
    }

    const overType = over.data.current?.type;
    const overId = String(over.id);

    // Merge eligibility: project hovering another project, or project hovering a folder header.
    // Folder dropzone → instant add on drop, no merge timer.
    if (overType === 'sidebar-folder') {
      // ok
    } else if (overType === 'sidebar-project') {
      const target = projectsRef.current.find(p => p.id === overId);
      if (!target || target.isInbox || target.ownerId !== user?.id) { cancelMerge(); return; }
    } else {
      cancelMerge();
      return;
    }

    // Same target as before — leave the timer running.
    if (mergeTargetIdRef.current === overId) return;

    // Target changed — reset timer.
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    mergeIntentRef.current = false;
    setMergeTarget(null);
    mergeTargetIdRef.current = overId;
    mergeTimerRef.current = setTimeout(() => {
      mergeIntentRef.current = true;
      setMergeTarget(overId);
    }, 1000);
  }, [cancelMerge, user?.id]);

  const doTopLevelReorder = useCallback((newOrder: SidebarTopLevelItem[]) => {
    fetchVersionRef.current++;
    setFolders(prev => {
      const updated = [...prev];
      newOrder.forEach((item, i) => {
        if (item.type === 'folder') {
          const idx = updated.findIndex(f => f.id === item.folder.id);
          if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i };
        }
      });
      return updated;
    });
    setProjects(prev => {
      const updated = [...prev];
      newOrder.forEach((item, i) => {
        if (item.type === 'project') {
          const idx = updated.findIndex(p => p.id === item.project.id);
          if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i };
        }
      });
      return updated;
    });
    // Optimistic sortOrder assignment exactly matches what the server computes
    // (both assign `index` to each item), so the success path does not need a
    // resync. fetchVersionRef guards against late in-flight fetches clobbering
    // the optimistic state.
    reorderTopLevel(newOrder.map(item => ({
      type: item.type,
      id: item.type === 'folder' ? item.folder.id : item.project.id,
    })))
      .catch(() => { toast.error('Failed to save order'); fetchAll(); });
  }, [fetchAll]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setTimeout(() => { dragOccurred = false; }, 0);

    const { active, over } = event;
    const activeType = active.data.current?.type;
    if (activeType !== 'sidebar-project' && activeType !== 'sidebar-folder') return;

    // Capture merge state BEFORE clearing — fixes race where the 1000ms timer fires
    // between the last onDragOver and onDragEnd.
    const mergeLatched = mergeIntentRef.current;
    const capturedMergeTarget = mergeTargetIdRef.current;
    cancelMerge();

    if (!over) return;

    try {
      const activeId = String(active.id);
      const overId = String(over.id);
      const overType = over.data.current?.type;
      const overContainer = over.data.current?.container as string | undefined;

      // ── Folder source ──────────────────────────────────────────────────────
      // Folders only participate in top-level reorder.
      if (activeType === 'sidebar-folder') {
        if (activeId === overId) return;
        if (overContainer !== 'toplevel') return;
        const items = topLevelItemsRef.current;
        const oldIdx = items.findIndex(it => it.id === activeId);
        const newIdx = items.findIndex(it => it.id === overId);
        if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
        const reordered = [...items];
        const [moved] = reordered.splice(oldIdx, 1);
        reordered.splice(newIdx, 0, moved);
        doTopLevelReorder(reordered);
        return;
      }

      // ── Project source ────────────────────────────────────────────────────
      const sourceProject = projectsRef.current.find(p => p.id === activeId);
      if (!sourceProject) return;
      const origFolderId = sourceProject.folderId ?? null;

      // Branch 1: Merge intent latched (1000ms hover over a project or folder header)
      if (mergeLatched && capturedMergeTarget) {
        const doRemoveFromOrig = origFolderId
          ? removeProjectFromFolder(origFolderId, activeId)
          : Promise.resolve();

        if (capturedMergeTarget.startsWith('folder-')) {
          // Merge into existing folder — place at TOP since the user explicitly hovered.
          const targetFolderId = capturedMergeTarget.replace('folder-', '');
          if (targetFolderId === origFolderId) { fetchAll(); return; }

          const targetFolder = foldersRef.current.find(f => f.id === targetFolderId);
          if (!targetFolder) {
            doRemoveFromOrig
              .then(() => addProjectToFolder(targetFolderId, activeId))
              .then(() => fetchAll())
              .catch(() => { toast.error('Failed to add to folder'); fetchAll(); });
            return;
          }

          const movedProject: ProjectResponse = { ...sourceProject, folderId: targetFolderId };
          const newOrderInFolder = [movedProject, ...targetFolder.projects];

          fetchVersionRef.current++;
          setProjects(prev => prev.map(p =>
            p.id === activeId ? { ...p, folderId: targetFolderId } : p
          ));
          setFolders(prev => prev.map(f => {
            if (f.id === targetFolderId) return { ...f, projects: newOrderInFolder };
            if (origFolderId && f.id === origFolderId) {
              return { ...f, projects: f.projects.filter(p => p.id !== activeId) };
            }
            return f;
          }));

          doRemoveFromOrig
            .then(() => addProjectToFolder(targetFolderId, activeId))
            .then(() => reorderFolderProjects(targetFolderId, newOrderInFolder.map(p => p.id)))
            .then(() => fetchAll())
            .catch(() => { toast.error('Failed to add to folder'); fetchAll(); });
          return;
        }

        // Project → project: create a new folder containing both.
        doRemoveFromOrig
          .then(() => createFolder('New Folder', [activeId, capturedMergeTarget]))
          .then(() => fetchAll())
          .catch(() => { toast.error('Failed to create folder'); fetchAll(); });
        return;
      }

      // Branch 2: Dropped onto a folder's children dropzone — add to end of that folder.
      if (overType === 'folder-dropzone') {
        const targetFolderId = over.data.current?.folderId as string;
        if (!targetFolderId || targetFolderId === origFolderId) return;
        const targetFolder = foldersRef.current.find(f => f.id === targetFolderId);
        if (!targetFolder) return;

        const movedProject: ProjectResponse = { ...sourceProject, folderId: targetFolderId };
        const newOrderInFolder = [...targetFolder.projects, movedProject];

        fetchVersionRef.current++;
        setProjects(prev => prev.map(p =>
          p.id === activeId ? { ...p, folderId: targetFolderId } : p
        ));
        setFolders(prev => prev.map(f => {
          if (f.id === targetFolderId) return { ...f, projects: newOrderInFolder };
          if (origFolderId && f.id === origFolderId) {
            return { ...f, projects: f.projects.filter(p => p.id !== activeId) };
          }
          return f;
        }));

        const doRemove = origFolderId
          ? removeProjectFromFolder(origFolderId, activeId)
          : Promise.resolve();
        doRemove
          .then(() => addProjectToFolder(targetFolderId, activeId))
          .then(() => fetchAll())
          .catch(() => { toast.error('Failed to add to folder'); fetchAll(); });
        return;
      }

      // Determine destination container from over.
      // If over is a sidebar-folder (header, no merge latched), treat as top-level reorder
      // at the folder's position.
      const destContainer = overContainer;

      // Branch 3: Same-container reorder (top-level or within the same folder)
      const sourceContainer = origFolderId ?? 'toplevel';
      if (destContainer === sourceContainer) {
        if (sourceContainer === 'toplevel') {
          if (activeId === overId) return;
          const items = topLevelItemsRef.current;
          const oldIdx = items.findIndex(it => it.id === activeId);
          const newIdx = items.findIndex(it => it.id === overId);
          if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
          const reordered = [...items];
          const [moved] = reordered.splice(oldIdx, 1);
          reordered.splice(newIdx, 0, moved);
          doTopLevelReorder(reordered);
          return;
        }
        // Within a folder
        const folderId = sourceContainer;
        const folder = foldersRef.current.find(f => f.id === folderId);
        if (!folder) return;
        const oldIdx = folder.projects.findIndex(p => p.id === activeId);
        const newIdx = folder.projects.findIndex(p => p.id === overId);
        if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
        const reordered = [...folder.projects];
        const [moved] = reordered.splice(oldIdx, 1);
        reordered.splice(newIdx, 0, moved);
        fetchVersionRef.current++;
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, projects: reordered } : f));
        // Same-container reorder: server assigns sortOrder = index, matching the
        // optimistic update. Skip the success refetch to avoid re-paint cascade.
        reorderFolderProjects(folderId, reordered.map(p => p.id))
          .catch(() => { toast.error('Failed to save order'); fetchFolders(); });
        return;
      }

      // Branch 4: Cross-container — move project to a different container at over's position.
      // Reject drops on a folder *header* without a latched merge intent: that's the
      // "accidentally drifted over Folder A while reordering inside Folder B" case
      // and was the source of the long-standing "popped out of folder" bug. Cross-
      // folder moves are only allowed via folder-dropzone (Branch 2) or merge
      // intent (Branch 1).
      if (overType === 'sidebar-folder') return;

      if (destContainer === 'toplevel') {
        // Move from folder to top level at over's position.
        if (!origFolderId) return;
        const items = topLevelItemsRef.current;
        const overIdx = items.findIndex(it => it.id === overId);
        if (overIdx < 0) return;

        const movedProject: ProjectResponse = { ...sourceProject, folderId: null };
        const movedItem: SidebarTopLevelItem = {
          type: 'project',
          id: movedProject.id,
          sortOrder: 0,
          project: movedProject,
        };
        const newTopLevel = [...items];
        newTopLevel.splice(overIdx, 0, movedItem);

        fetchVersionRef.current++;
        setProjects(prev => prev.map(p => p.id === activeId ? { ...p, folderId: null } : p));
        setFolders(prev => prev.map(f => f.id === origFolderId
          ? { ...f, projects: f.projects.filter(p => p.id !== activeId) }
          : f));

        removeProjectFromFolder(origFolderId, activeId)
          .then(() => reorderTopLevel(newTopLevel.map(it => ({
            type: it.type,
            id: it.type === 'folder' ? it.folder.id : it.project.id,
          }))))
          .then(() => fetchAll())
          .catch(() => { toast.error('Failed to remove from folder'); fetchAll(); });
        return;
      }

      if (typeof destContainer === 'string' && destContainer !== 'toplevel') {
        // Move into another folder at over's position.
        const targetFolderId = destContainer;
        // Same-folder is Branch 3's job. Falling into this branch with
        // origFolderId === targetFolderId would insert a duplicate copy of the
        // moved project into the folder's children → duplicate React keys.
        if (targetFolderId === origFolderId) return;
        const targetFolder = foldersRef.current.find(f => f.id === targetFolderId);
        if (!targetFolder) return;
        const overIdx = targetFolder.projects.findIndex(p => p.id === overId);
        if (overIdx < 0) return;

        const movedProject: ProjectResponse = { ...sourceProject, folderId: targetFolderId };
        const newOrderInFolder = [...targetFolder.projects];
        newOrderInFolder.splice(overIdx, 0, movedProject);

        fetchVersionRef.current++;
        setProjects(prev => prev.map(p => p.id === activeId ? { ...p, folderId: targetFolderId } : p));
        setFolders(prev => prev.map(f => {
          if (f.id === targetFolderId) return { ...f, projects: newOrderInFolder };
          if (origFolderId && f.id === origFolderId) {
            return { ...f, projects: f.projects.filter(p => p.id !== activeId) };
          }
          return f;
        }));

        const doRemove = origFolderId
          ? removeProjectFromFolder(origFolderId, activeId)
          : Promise.resolve();
        doRemove
          .then(() => addProjectToFolder(targetFolderId, activeId))
          .then(() => reorderFolderProjects(targetFolderId, newOrderInFolder.map(p => p.id)))
          .then(() => fetchAll())
          .catch(() => { toast.error('Failed to move between folders'); fetchAll(); });
        return;
      }
    } catch (err) {
      // Safety net: any unhandled throw in a drag branch would otherwise blank the page.
      console.error('[Sidebar DnD] onDragEnd crashed', err);
      toast.error('Something went wrong during drag. Reloading list...');
      fetchAll();
    }
  }, [cancelMerge, doTopLevelReorder, fetchAll, fetchFolders]);

  useDndMonitor({
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragEnd: handleDragEnd,
    onDragCancel: () => { setTimeout(() => { dragOccurred = false; }, 0); cancelMerge(); },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  // Guard every navigable link in the sidebar: after a drag, the browser
  // synthesizes a `click` on whatever element sits under the pointer. Without
  // this check, dragging a project UP and releasing over a Smart List or the
  // Inbox navigates the route, which looks like a page reload.
  const handleNavClick = useCallback((e: React.MouseEvent) => {
    if (dragOccurred) { e.preventDefault(); return; }
    onClose();
  }, [onClose]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-blue-100 dark:bg-gray-700 text-blue-700 dark:text-gray-100 font-medium'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
    }`;

  const allProjects = projects;

  const pinnedProjects = (user?.pinnedProjectIds ?? [])
    .map(id => allProjects.find(p => p.id === id))
    .filter((p): p is ProjectResponse => p !== undefined);

  const pinnedTags = (user?.pinnedTagIds ?? [])
    .map(id => tags.find(t => t.id === id))
    .filter((t): t is TagFull => t !== undefined);

  const handlePinProject = async (projectId: string) => {
    if (!user) return;
    const current = user.pinnedProjectIds ?? [];
    const already = current.includes(projectId);
    const next = already ? current.filter(id => id !== projectId) : [...current, projectId];
    try {
      await updateProfile({ pinnedProjectIds: next });
      await refreshUser();
    } catch {
      toast.error('Failed to update pinned projects');
    }
    setContextMenu(null);
    setPinContextMenu(null);
  };

  const handlePinTag = async (tagId: string) => {
    if (!user) return;
    const current = user.pinnedTagIds ?? [];
    const already = current.includes(tagId);
    const next = already ? current.filter(id => id !== tagId) : [...current, tagId];
    try {
      await updateProfile({ pinnedTagIds: next });
      await refreshUser();
    } catch {
      toast.error('Failed to update pinned tags');
    }
    setTagContextMenu(null);
    setPinContextMenu(null);
  };

  const handleUnpin = async (type: 'project' | 'tag', id: string) => {
    if (!user) return;
    try {
      if (type === 'project') {
        const next = (user.pinnedProjectIds ?? []).filter(pid => pid !== id);
        await updateProfile({ pinnedProjectIds: next });
      } else {
        const next = (user.pinnedTagIds ?? []).filter(tid => tid !== id);
        await updateProfile({ pinnedTagIds: next });
      }
      await refreshUser();
    } catch {
      toast.error('Failed to unpin');
    }
    setPinContextMenu(null);
  };

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
                  {((!gravatarFailed && gravatarUrl) || user?.avatarUrl) ? (
                    <img
                      src={(!gravatarFailed && gravatarUrl) ? gravatarUrl : user!.avatarUrl!}
                      alt={user?.displayName}
                      className="w-7 h-7 rounded-full object-cover"
                      onError={() => setGravatarFailed(true)}
                    />
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

        {/* Navigation */}
        <div className="flex-1 relative min-h-0">
        <nav ref={navRef} className="h-full overflow-y-auto px-3 py-3 space-y-1">
          <button onClick={toggleSmartLists} className="flex items-center gap-1 px-3 py-1 w-full text-left">
            {smartListsCollapsed
              ? <ChevronRight size={12} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
              : <ChevronDown size={12} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />}
            <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Smart Lists
            </span>
          </button>
          {!smartListsCollapsed && smartLists
            .filter(({ key, to }) =>
              (key !== 'all' || user?.showAllTasksList !== false) &&
              (key !== 'priority' || user?.showPriorityTasksList === true) &&
              (to !== '/app/assigned' || hasAssignedTasks !== false)
            )
            .map(({ to, label, icon: Icon, key }) => (
              <NavLink key={to} to={to} className={navLinkClass} onClick={handleNavClick}>
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {smartListCounts[key] > 0 && (
                  <span className="text-xs text-gray-400">{smartListCounts[key]}</span>
                )}
              </NavLink>
            ))}

          {!smartListsCollapsed && (pinnedProjects.length > 0 || pinnedTags.length > 0) && (
            <>
              <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
              {pinnedProjects.map(project => (
                <div key={project.id} className="relative group/pin">
                  <NavLink to={`/app/projects/${project.id}`} className={navLinkClass} onClick={handleNavClick}>
                    <Pin size={14} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    <span className="flex-1 truncate">{project.name}</span>
                  </NavLink>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPinContextMenu(prev => prev?.id === project.id ? null : { type: 'project', id: project.id, rect });
                      setContextMenu(null);
                      setTagContextMenu(null);
                    }}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity ${pinContextMenu?.id === project.id ? 'opacity-100' : 'opacity-0 group-hover/pin:opacity-100'}`}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              ))}
              {pinnedTags.map(tag => (
                <div key={tag.id} className="relative group/pin">
                  <NavLink to={`/app/tags/${tag.id}`} className={navLinkClass} onClick={handleNavClick}>
                    <Pin size={14} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    <span className="flex-1 truncate">{tag.name}</span>
                  </NavLink>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPinContextMenu(prev => prev?.id === tag.id ? null : { type: 'tag', id: tag.id, rect });
                      setContextMenu(null);
                      setTagContextMenu(null);
                    }}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity ${pinContextMenu?.id === tag.id ? 'opacity-100' : 'opacity-0 group-hover/pin:opacity-100'}`}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              ))}
            </>
          )}

          <div className="my-3 border-t border-gray-200 dark:border-gray-700" />

          {/* Projects */}
          <div className="flex items-center px-3 py-1">
            <button onClick={toggleProjects} className="flex items-center gap-1 flex-1 min-w-0 text-left">
              {projectsCollapsed
                ? <ChevronRight size={12} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
                : <ChevronDown size={12} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />}
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Projects
              </span>
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-gray-400 hover:text-blue-500 transition-colors -mr-1"
              title="New project"
            >
              <Plus size={16} />
            </button>
          </div>

          {!projectsCollapsed && (projects.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500 italic">
              No projects yet
            </p>
          ) : (
            <>
              {inboxProject && (
                <InboxProjectItem
                  project={inboxProject}
                  navLinkClass={navLinkClass}
                  onNavClick={handleNavClick}
                />
              )}

              <SortableContext
                items={topLevelItems.map(it => it.id)}
                strategy={verticalListSortingStrategy}
              >
                {topLevelItems.map(item =>
                  item.type === 'folder' ? (
                    <SortableFolderItem
                      key={item.folder.id}
                      folder={item.folder}
                      mergeTarget={mergeTarget}
                      userId={user?.id}
                      navLinkClass={navLinkClass}
                      onClose={onClose}
                      onRename={handleRenameFolder}
                      onFolderContextMenu={(folderId, rect) =>
                        setFolderContextMenu(folderContextMenu?.folderId === folderId ? null : { folderId, rect })
                      }
                      folderContextMenuId={folderContextMenu?.folderId ?? null}
                      onProjectContextMenu={(projectId, folderId, rect) => {
                        setContextMenu(contextMenu?.projectId === projectId ? null : { projectId, folderId, rect });
                        setPinContextMenu(null);
                      }}
                      projectContextMenuId={contextMenu?.projectId ?? null}
                      onShareClick={setSharingProject}
                      onCollapseToggle={handleCollapseToggle}
                      externalRenameRequest={folderRenaming === item.folder.id}
                      onExternalRenameHandled={() => setFolderRenaming(null)}
                    />
                  ) : (
                    <SortableProjectItem
                      key={item.project.id}
                      project={item.project}
                      container="toplevel"
                      userId={user?.id}
                      navLinkClass={navLinkClass}
                      onClose={onClose}
                      onContextMenu={(projectId, folderId, rect) => {
                        setContextMenu(contextMenu?.projectId === projectId ? null : { projectId, folderId, rect });
                        setPinContextMenu(null);
                      }}
                      contextMenuProjectId={contextMenu?.projectId ?? null}
                      taskCount={item.project.taskCount - item.project.completedTaskCount}
                      onShareClick={setSharingProject}
                      mergeTarget={mergeTarget}
                    />
                  )
                )}
              </SortableContext>
            </>
          ))}

          {/* Tags */}
          {tags.some(t => t.taskCount > 0) && (
            <>
              <div className="my-3 border-t border-gray-200 dark:border-gray-700" />
              <div className="flex items-center px-3 py-1">
                <button onClick={toggleTags} className="flex items-center gap-1 flex-1 min-w-0 text-left">
                  {tagsCollapsed
                    ? <ChevronRight size={12} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    : <ChevronDown size={12} className="flex-shrink-0 text-gray-400 dark:text-gray-500" />}
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Tags
                  </span>
                </button>
                <button
                  onClick={() => setShowCreateTagModal(true)}
                  className="text-gray-400 hover:text-blue-500 transition-colors -mr-1"
                  title="New tag"
                >
                  <Plus size={16} />
                </button>
              </div>
              {!tagsCollapsed && tags.filter(t => t.taskCount > 0).map(tag => (
                <div key={tag.id} className="relative group/tag flex items-center">
                  <NavLink
                    to={`/app/tags/${tag.id}`}
                    className={({ isActive }) => navLinkClass({ isActive }) + ' flex-1 min-w-0'}
                    onClick={handleNavClick}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    <span className="flex-1 truncate">{tag.name}</span>
                    <span className="text-xs text-gray-400 group-hover/tag:invisible">{tag.taskCount}</span>
                  </NavLink>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTagContextMenu(tagContextMenu?.tagId === tag.id ? null : { tagId: tag.id, rect });
                      setContextMenu(null);
                      setPinContextMenu(null);
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

      {/* Project context menu */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px]"
            style={{
              top: contextMenu.rect.bottom + 4 + (contextMenu.folderId ? 165 : 140) > window.innerHeight
                ? contextMenu.rect.top - (contextMenu.folderId ? 165 : 140)
                : contextMenu.rect.bottom + 4,
              left: contextMenu.rect.left,
            }}
          >
            <button
              onClick={() => {
                const project = allProjects.find(p => p.id === contextMenu.projectId);
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
            {(() => {
              const p = allProjects.find(p => p.id === contextMenu.projectId);
              return p && !p.householdId && !p.isInbox ? (
                <button
                  onClick={() => { setSharingProject(p); setContextMenu(null); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Share2 size={14} />
                  Share
                </button>
              ) : null;
            })()}
            {contextMenu.folderId && (
              <button
                onClick={() => handleRemoveFromFolder(contextMenu.folderId!, contextMenu.projectId)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FolderPlus size={14} className="rotate-180" />
                Remove from folder
              </button>
            )}
            <button
              onClick={() => handlePinProject(contextMenu.projectId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Pin size={14} />
              {user?.pinnedProjectIds?.includes(contextMenu.projectId) ? 'Unpin' : 'Pin'}
            </button>
            <button
              onClick={() => {
                const project = allProjects.find(p => p.id === contextMenu.projectId);
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

      {/* Folder context menu */}
      {folderContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setFolderContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px]"
            style={{
              top: folderContextMenu.rect.bottom + 4 + 80 > window.innerHeight
                ? folderContextMenu.rect.top - 80
                : folderContextMenu.rect.bottom + 4,
              left: folderContextMenu.rect.left,
            }}
          >
            <button
              onClick={() => {
                setFolderContextMenu(null);
                setFolderRenaming(folderContextMenu.folderId);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Pencil size={14} />
              Rename
            </button>
            <button
              onClick={() => handleDeleteFolder(folderContextMenu.folderId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 size={14} />
              Delete folder
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

      {sharingProject && (
        <ProjectShareModal
          project={sharingProject}
          onClose={() => setSharingProject(null)}
        />
      )}

      {tagContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setTagContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]"
            style={{
              top: tagContextMenu.rect.bottom + 4 + 105 > window.innerHeight
                ? tagContextMenu.rect.top - 105
                : tagContextMenu.rect.bottom + 4,
              left: tagContextMenu.rect.left,
            }}
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
              onClick={() => handlePinTag(tagContextMenu.tagId)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Pin size={14} />
              {user?.pinnedTagIds?.includes(tagContextMenu.tagId) ? 'Unpin' : 'Pin'}
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

      {pinContextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setPinContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]"
            style={{
              top: pinContextMenu.rect.bottom + 4 + 50 > window.innerHeight
                ? pinContextMenu.rect.top - 50
                : pinContextMenu.rect.bottom + 4,
              left: pinContextMenu.rect.left,
            }}
          >
            <button
              onClick={() => handleUnpin(pinContextMenu.type, pinContextMenu.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Pin size={14} />
              Unpin
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
