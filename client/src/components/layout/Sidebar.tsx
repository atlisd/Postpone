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
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { useSidebarDrag, sidebarDragJustHappened, type IntoTarget } from './sidebarDrag/useSidebarDrag';
import { DragGhost } from './sidebarDrag/DragGhost';
import type { DragSource, DropTarget, RowMeta } from './sidebarDrag/types';
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

// ─── SidebarProjectItem ──────────────────────────────────────────────────────

interface SidebarProjectItemProps {
  project: ProjectResponse;
  container: string; // 'toplevel' or folderId
  userId: string | undefined;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
  onContextMenu: (projectId: string, folderId: string | undefined, rect: DOMRect) => void;
  contextMenuProjectId: string | null;
  taskCount: number;
  onShareClick: (project: ProjectResponse) => void;
  intoTarget: IntoTarget | null;
  registerRow: (meta: RowMeta) => (el: HTMLElement | null) => void;
  onRowPointerDown: (e: React.PointerEvent, source: DragSource, blockEl?: HTMLElement) => void;
}

function SidebarProjectItem({
  project,
  container,
  userId,
  navLinkClass,
  onClose,
  onContextMenu,
  contextMenuProjectId,
  taskCount,
  onShareClick,
  intoTarget,
  registerRow,
  onRowPointerDown,
}: SidebarProjectItemProps) {
  // Droppable only — task chips dragged by dnd-kit land here (AppShell's onDragEnd
  // reads projectId/projectName from this data). Sidebar project drags themselves
  // run on the custom engine, not dnd-kit.
  const { setNodeRef, isOver } = useDroppable({
    id: project.id,
    data: {
      type: 'sidebar-project',
      projectId: project.id,
      projectName: project.name,
    },
  });
  const { active } = useDndContext();
  const activeType = active?.data.current?.type;
  const isTaskHovering = isOver && activeType === 'task-item';
  const isIntoTarget = intoTarget?.id === project.id;
  const intoLatched = isIntoTarget && intoTarget.latched;

  const engineRef = registerRow({
    id: project.id,
    kind: 'project',
    container,
    intoEligible: !project.isInbox && project.ownerId === userId,
  });
  const setRefs = useCallback((el: HTMLElement | null) => {
    setNodeRef(el);
    engineRef(el);
  }, [setNodeRef, engineRef]);

  return (
    <div
      ref={setRefs}
      data-drag-id={project.id}
      onPointerDown={(e) => onRowPointerDown(e, {
        id: project.id,
        kind: 'project',
        container,
        canMerge: !project.isInbox && project.ownerId === userId,
        name: project.name,
        color: project.color,
      })}
      className={`rounded-md ${isTaskHovering ? 'ring-2 ring-blue-400 ring-inset' : ''} ${
        isIntoTarget ? 'bg-blue-50/60 dark:bg-blue-900/25' : ''
      }`}
    >
      <div className="relative group">
        {intoLatched && (
          <div className="absolute inset-0 rounded-md ring-2 ring-dashed ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20 pointer-events-none z-10 flex items-center justify-center">
            <FolderPlus size={14} className="text-blue-500" />
          </div>
        )}
        <NavLink
          to={`/app/projects/${project.id}`}
          className={navLinkClass}
          draggable={false}
          onClick={(e) => { if (sidebarDragJustHappened()) { e.preventDefault(); return; } onClose(); }}
        >
          <span
            data-drag-grip
            className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
            // preventDefault is essential: this span sits inside the NavLink's <a>.
            // A plain (non-drag) click on the grip must not trigger the native
            // <a href> navigation (which the browser commits as a full page reload).
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <GripVertical size={16} className="hidden group-hover:block text-gray-400" />
            <FolderOpen size={16} style={{ color: project.color }} className="block group-hover:hidden" />
          </span>
          <span className="flex-1 truncate">{project.name}</span>
          {project.householdId && <Users size={12} className="text-gray-400 flex-shrink-0" />}
          {!project.householdId && project.shareCount > 0 && (
            <button
              data-no-drag
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
            data-no-drag
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

// ─── SidebarFolderItem ───────────────────────────────────────────────────────

interface SidebarFolderItemProps {
  folder: ProjectFolderResponse;
  intoTarget: IntoTarget | null;
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
  registerRow: (meta: RowMeta) => (el: HTMLElement | null) => void;
  onRowPointerDown: (e: React.PointerEvent, source: DragSource, blockEl?: HTMLElement) => void;
  /** Rendered expanded for the duration of a drag (auto-expand), without persisting. */
  dragExpanded: boolean;
}

function SidebarFolderItem({
  folder,
  intoTarget,
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
  registerRow,
  onRowPointerDown,
  dragExpanded,
}: SidebarFolderItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(folder.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const folderRowId = `folder-${folder.id}`;

  const headerRef = registerRow({
    id: folderRowId,
    kind: 'folder-header',
    container: 'toplevel',
    intoEligible: true,
  });
  const childrenRef = registerRow({
    id: `children-${folder.id}`,
    kind: 'folder-children',
    container: folder.id,
    intoEligible: false,
  });

  const showChildren = !folder.isCollapsed || dragExpanded;
  const isMergeTarget = intoTarget?.id === folderRowId && intoTarget.latched;
  const isIntoTinted = intoTarget?.id === folderRowId;

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
    <div ref={wrapperRef} data-drag-id={folderRowId}>
      {/* Folder header */}
      <div
        ref={headerRef}
        onPointerDown={(e) => onRowPointerDown(e, {
          id: folderRowId,
          kind: 'folder',
          container: 'toplevel',
          canMerge: false,
          name: folder.name,
          childCount: folder.projects.length,
        }, wrapperRef.current ?? undefined)}
        className={`relative group/folder rounded-md ${
          isMergeTarget
            ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/40 dark:bg-blue-900/20'
            : isIntoTinted ? 'bg-blue-50/60 dark:bg-blue-900/25' : ''
        }`}
      >
        <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-default select-none">
          {/* Drag handle */}
          <span
            data-drag-grip
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
              if (sidebarDragJustHappened()) return;
              if (!isRenaming) onCollapseToggle(folder.id, !folder.isCollapsed);
            }}
          >
            {isRenaming ? (
              <input
                ref={renameInputRef}
                data-no-drag
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
          data-no-drag
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
      {showChildren && (
        <div
          ref={childrenRef}
          className="ml-3 border-l border-gray-200 dark:border-gray-700 pl-1 mt-0.5 space-y-0.5 min-h-[8px] rounded-md"
        >
          {(() => {
            // Dedupe defensively — a stale optimistic write that left the same
            // project in two folders would otherwise produce duplicate React keys
            // and blank the sidebar.
            const seen = new Set<string>();
            const uniqueProjects = folder.projects.filter(p => {
              if (seen.has(p.id)) return false;
              seen.add(p.id);
              return true;
            });
            return uniqueProjects.map(project => (
              <SidebarProjectItem
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
                intoTarget={intoTarget}
                registerRow={registerRow}
                onRowPointerDown={onRowPointerDown}
              />
            ));
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
  // Drag freeze: SignalR-triggered fetchAll is deferred while a sidebar drag is
  // active so row geometry stays stable for the whole drag; replayed at drag end.
  const dragActiveRef = useRef(false);
  const pendingFetchAllRef = useRef(false);

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

  // Suppress the post-sidebar-drag synthesized click at the document level.
  //
  // After a drag, the browser synthesizes a click on the common ancestor of the
  // pointerdown/up targets. preventDefault here blocks the native <a href>
  // navigation (a full page reload) AND makes React Router's <Link> bail (it
  // checks event.defaultPrevented). The per-NavLink guards are belt-and-suspenders.
  //
  // This listener also matters for dnd-kit *task-chip* drags released over sidebar
  // links: dnd-kit's PointerSensor arms a capture-phase stopPropagation click-eater
  // that kills React's delegated onClick but NOT the native <a> default action.
  // Our listener registers first (capture-phase listeners fire in registration
  // order), so preventDefault still lands. (Task drags don't set the sidebar flag,
  // but dnd-kit hides those synthesized clicks itself; the flag covers engine drags.)
  useEffect(() => {
    const onCapturedClick = (e: MouseEvent) => {
      if (sidebarDragJustHappened()) e.preventDefault();
    };
    document.addEventListener('click', onCapturedClick, true);
    return () => document.removeEventListener('click', onCapturedClick, true);
  }, []);

  const fetchAll = useCallback(() => {
    if (dragActiveRef.current) {
      pendingFetchAllRef.current = true;
      return;
    }
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

  // ── Commit functions ─────────────────────────────────────────────────────
  // Bodies preserved from the pre-engine dnd-kit branches. All follow the same
  // pattern: optimistic setState + fetchVersionRef bump, then the API chain.
  // Same-container reorders skip the success refetch (server assigns
  // sortOrder = index, identical to the optimistic state); cross-container
  // moves reconcile with fetchAll().

  const reorderWithinFolder = useCallback((folderId: string, orderedProjects: ProjectResponse[]) => {
    fetchVersionRef.current++;
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, projects: orderedProjects } : f));
    reorderFolderProjects(folderId, orderedProjects.map(p => p.id))
      .catch(() => { toast.error('Failed to save order'); fetchFolders(); });
  }, [fetchFolders]);

  const moveProjectToTopLevel = useCallback((sourceProject: ProjectResponse, index: number) => {
    const origFolderId = sourceProject.folderId;
    if (!origFolderId) return;
    const items = topLevelItemsRef.current;
    const movedProject: ProjectResponse = { ...sourceProject, folderId: null };
    const movedItem: SidebarTopLevelItem = {
      type: 'project',
      id: movedProject.id,
      sortOrder: 0,
      project: movedProject,
    };
    const newTopLevel = [...items];
    newTopLevel.splice(Math.min(index, newTopLevel.length), 0, movedItem);

    fetchVersionRef.current++;
    // Flip folderId AND assign the new sortOrders so the row lands at its drop
    // position immediately (not at the end until fetchAll resolves).
    setProjects(prev => {
      const updated = prev.map(p => p.id === sourceProject.id ? { ...p, folderId: null } : p);
      newTopLevel.forEach((item, i) => {
        if (item.type === 'project') {
          const idx = updated.findIndex(p => p.id === item.project.id);
          if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i };
        }
      });
      return updated;
    });
    setFolders(prev => {
      const updated = prev.map(f => f.id === origFolderId
        ? { ...f, projects: f.projects.filter(p => p.id !== sourceProject.id) }
        : f);
      newTopLevel.forEach((item, i) => {
        if (item.type === 'folder') {
          const idx = updated.findIndex(f => f.id === item.folder.id);
          if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i };
        }
      });
      return updated;
    });

    removeProjectFromFolder(origFolderId, sourceProject.id)
      .then(() => reorderTopLevel(newTopLevel.map(it => ({
        type: it.type,
        id: it.type === 'folder' ? it.folder.id : it.project.id,
      }))))
      .then(() => fetchAll())
      .catch(() => { toast.error('Failed to remove from folder'); fetchAll(); });
  }, [fetchAll]);

  const moveProjectToFolder = useCallback((sourceProject: ProjectResponse, folderId: string, index: number) => {
    const origFolderId = sourceProject.folderId ?? null;
    const targetFolder = foldersRef.current.find(f => f.id === folderId);
    if (!targetFolder) return;
    const movedProject: ProjectResponse = { ...sourceProject, folderId };
    const rest = targetFolder.projects.filter(p => p.id !== sourceProject.id);
    const newOrderInFolder = [...rest];
    newOrderInFolder.splice(Math.min(index, rest.length), 0, movedProject);

    fetchVersionRef.current++;
    setProjects(prev => prev.map(p => p.id === sourceProject.id ? { ...p, folderId } : p));
    setFolders(prev => prev.map(f => {
      if (f.id === folderId) return { ...f, projects: newOrderInFolder };
      if (origFolderId && f.id === origFolderId) {
        return { ...f, projects: f.projects.filter(p => p.id !== sourceProject.id) };
      }
      return f;
    }));

    const doRemove = origFolderId
      ? removeProjectFromFolder(origFolderId, sourceProject.id)
      : Promise.resolve();
    doRemove
      .then(() => addProjectToFolder(folderId, sourceProject.id))
      .then(() => reorderFolderProjects(folderId, newOrderInFolder.map(p => p.id)))
      .then(() => fetchAll())
      .catch(() => { toast.error('Failed to move to folder'); fetchAll(); });
  }, [fetchAll]);

  const mergeProjects = useCallback((sourceProject: ProjectResponse, targetProjectId: string) => {
    const origFolderId = sourceProject.folderId ?? null;
    fetchVersionRef.current++;
    const doRemove = origFolderId
      ? removeProjectFromFolder(origFolderId, sourceProject.id)
      : Promise.resolve();
    doRemove
      .then(() => createFolder('New Folder', [sourceProject.id, targetProjectId]))
      .then(() => fetchAll())
      .catch(() => { toast.error('Failed to create folder'); fetchAll(); });
  }, [fetchAll]);

  // ── Drop dispatcher ──────────────────────────────────────────────────────
  // The engine resolves every drop to a typed target (spatial zones replaced the
  // old branch-priority ordering), so this is a plain switch. The try/catch is
  // the "blank page" safety net.

  const handleDrop = useCallback((source: DragSource, target: DropTarget, dragExpandedIds: string[]) => {
    try {
      if (target.kind === 'none') return;

      const reorderTopLevelTo = (index: number) => {
        const items = topLevelItemsRef.current;
        const srcItem = items.find(it => it.id === source.id);
        if (!srcItem) return;
        const rest = items.filter(it => it.id !== source.id);
        const reordered = [...rest];
        reordered.splice(Math.min(index, rest.length), 0, srcItem);
        if (reordered.every((it, i) => it.id === items[i].id)) return; // no-op drop
        doTopLevelReorder(reordered);
      };

      // A drop inside a folder that was auto-expanded during this drag makes the
      // expansion permanent.
      const persistExpansion = (folderId: string) => {
        if (!dragExpandedIds.includes(folderId)) return;
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, isCollapsed: false } : f));
        setFolderCollapsed(folderId, false).catch(() => {});
      };

      if (source.kind === 'folder') {
        if (target.kind !== 'reorder-toplevel') return; // folders never nest
        reorderTopLevelTo(target.index);
        return;
      }

      const sourceProject = projectsRef.current.find(p => p.id === source.id);
      if (!sourceProject || sourceProject.isInbox) return;

      switch (target.kind) {
        case 'reorder-toplevel': {
          if (sourceProject.folderId) {
            moveProjectToTopLevel(sourceProject, target.index);
          } else {
            reorderTopLevelTo(target.index);
          }
          return;
        }
        case 'reorder-in-folder':
        case 'move-to-folder': {
          // An into-latch on the header of the folder the project is already in
          // arrives as move-to-folder — treat it as a within-folder reorder.
          if (target.folderId === (sourceProject.folderId ?? null)) {
            const folder = foldersRef.current.find(f => f.id === target.folderId);
            if (!folder) return;
            const rest = folder.projects.filter(p => p.id !== sourceProject.id);
            const reordered = [...rest];
            reordered.splice(Math.min(target.index, rest.length), 0, sourceProject);
            if (reordered.every((p, i) => p.id === folder.projects[i]?.id)) return;
            reorderWithinFolder(target.folderId, reordered);
          } else {
            moveProjectToFolder(sourceProject, target.folderId, target.index);
            persistExpansion(target.folderId);
          }
          return;
        }
        case 'merge-projects': {
          mergeProjects(sourceProject, target.targetProjectId);
          return;
        }
      }
    } catch (err) {
      // Safety net: any unhandled throw here would otherwise blank the page.
      console.error('[Sidebar DnD] drop handler crashed', err);
      toast.error('Something went wrong during drag. Reloading list...');
      fetchAll();
    }
  }, [doTopLevelReorder, fetchAll, mergeProjects, moveProjectToFolder, moveProjectToTopLevel, reorderWithinFolder]);

  const handleDragActiveChange = useCallback((active: boolean) => {
    if (active) {
      dragActiveRef.current = true;
      // Kill fetches already in flight so a late response can't reshuffle rows mid-drag.
      fetchVersionRef.current++;
    } else {
      dragActiveRef.current = false;
      if (pendingFetchAllRef.current) {
        // A fetchAll was requested mid-drag — replay it now that geometry is free.
        pendingFetchAllRef.current = false;
        fetchAll();
      }
    }
  }, [fetchAll]);

  const {
    registerRow,
    handleRowPointerDown,
    dragState,
    intoTarget,
    dragExpandedFolderIds,
    ghostRef,
    indicatorRef,
  } = useSidebarDrag({
    navRef,
    onDrop: handleDrop,
    onDragActiveChange: handleDragActiveChange,
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  // Guard every navigable link in the sidebar: after a drag, the browser
  // synthesizes a `click` on whatever element sits under the pointer. Without
  // this check, dragging a project UP and releasing over a Smart List or the
  // Inbox navigates the route, which looks like a page reload.
  const handleNavClick = useCallback((e: React.MouseEvent) => {
    if (sidebarDragJustHappened()) { e.preventDefault(); return; }
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
        className={`fixed top-0 left-0 h-full w-60 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 z-50 flex flex-col transition-transform duration-200 md:translate-x-0 md:static md:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${!desktopVisible ? 'md:hidden' : ''}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{user?.appName || 'Postpone'}</h1>
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
        <nav ref={navRef} className="relative h-full overflow-y-auto px-3 py-3 space-y-1">
          {/* Insertion indicator — positioned imperatively by the drag engine in
              content-space, so it scrolls with the list. */}
          <div
            ref={indicatorRef}
            className="absolute z-20 h-0.5 rounded-full bg-blue-500 dark:bg-blue-400 pointer-events-none"
            style={{ opacity: 0, margin: 0 }}
          />
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
              <div className="my-1.5 border-t border-gray-200 dark:border-gray-700" />
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

          <div className="my-1.5 border-t border-gray-200 dark:border-gray-700" />

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

              {topLevelItems.map(item =>
                item.type === 'folder' ? (
                  <SidebarFolderItem
                    key={item.folder.id}
                    folder={item.folder}
                    intoTarget={intoTarget}
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
                    registerRow={registerRow}
                    onRowPointerDown={handleRowPointerDown}
                    dragExpanded={dragExpandedFolderIds.includes(item.folder.id)}
                  />
                ) : (
                  <SidebarProjectItem
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
                    intoTarget={intoTarget}
                    registerRow={registerRow}
                    onRowPointerDown={handleRowPointerDown}
                  />
                )
              )}
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

      {/* Floating drag preview (portal to body) */}
      {dragState && (
        <DragGhost ref={ghostRef} source={dragState.source} width={dragState.ghostWidth} />
      )}

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
