import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSignalR } from '../../hooks/useSignalR';
import { listProjects, createProject, deleteProject, updateProject } from '../../api/projects';
import { reorderFolderProjects, reorderTopLevel, listFolders, createFolder, updateFolder, deleteFolder, addProjectToFolder, removeProjectFromFolder, setFolderCollapsed } from '../../api/folders';
import { listTags, createTag, updateTag, deleteTag } from '../../api/tags';
import { getSmartList } from '../../api/tasks';
import { ProjectFormModal } from '../projects/ProjectFormModal';
import { TagFormModal } from '../tags/TagFormModal';
import type { ProjectResponse, ProjectFolderResponse, TagFull } from '../../types/api';
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
  index: number;
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
  index,
  userId,
  navLinkClass,
  onClose,
  onContextMenu,
  contextMenuProjectId,
  taskCount,
  onShareClick,
  mergeTarget,
}: SortableProjectItemProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: project.id,
    index,
    group: 'sidebar-toplevel',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accept: (draggable: any) => {
      const g = String(draggable?.group ?? '');
      return g === 'sidebar-toplevel' || g.startsWith('sidebar-folder-');
    },
  });
  const { ref: dropRef, isDropTarget } = useDroppable({
    id: 'project-drop-' + project.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accept: (draggable: any) => draggable?.group !== 'sidebar-toplevel' && !String(draggable?.group ?? '').startsWith('sidebar-folder-'),
  });
  const { source } = useDragOperation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDraggingProject = (source as any)?.group === 'sidebar-toplevel' || String((source as any)?.group ?? '').startsWith('sidebar-folder-');
  const isMergeTarget = mergeTarget === project.id;

  return (
    <div ref={dropRef} data-merge-id={project.id} data-project-drop-id={project.id} data-project-drop-name={project.name} className={`rounded-md ${isDropTarget && !isDraggingProject ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
    <div ref={ref} data-drag-id={project.id} className={`relative group ${isDragging ? 'opacity-50' : ''}`}>
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
          ref={handleRef}
          className="cursor-grab active:cursor-grabbing flex-shrink-0"
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
            onContextMenu(project.id, undefined, rect);
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

// ─── FolderProjectItem ───────────────────────────────────────────────────────

interface FolderProjectItemProps {
  project: ProjectResponse;
  folderId: string;
  index: number;
  userId: string | undefined;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
  onContextMenu: (projectId: string, folderId: string | undefined, rect: DOMRect) => void;
  contextMenuProjectId: string | null;
  taskCount: number;
  onShareClick: (project: ProjectResponse) => void;
}

function FolderProjectItem({
  project,
  folderId,
  index,
  userId,
  navLinkClass,
  onClose,
  onContextMenu,
  contextMenuProjectId,
  taskCount,
  onShareClick,
}: FolderProjectItemProps) {
  const { ref, handleRef, isDragging } = useSortable({
    id: project.id,
    index,
    group: `sidebar-folder-${folderId}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accept: (draggable: any) => {
      const g = String(draggable?.group ?? '');
      return g === 'sidebar-toplevel' || g.startsWith('sidebar-folder-');
    },
  });
  const { ref: dropRef, isDropTarget } = useDroppable({
    id: 'project-drop-' + project.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accept: (draggable: any) => draggable?.group !== 'sidebar-toplevel' && !String(draggable?.group ?? '').startsWith('sidebar-folder-'),
  });
  const { source } = useDragOperation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDraggingProject = (source as any)?.group === 'sidebar-toplevel' || String((source as any)?.group ?? '').startsWith('sidebar-folder-');

  return (
    <div ref={dropRef} data-project-drop-id={project.id} data-project-drop-name={project.name} className={`rounded-md ${isDropTarget && !isDraggingProject ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
    <div ref={ref} data-drag-id={project.id} className={`relative group ${isDragging ? 'opacity-50' : ''}`}>
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
            onContextMenu(project.id, folderId, rect);
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
  index: number;
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
  index,
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

  const { ref, handleRef, isDragging } = useSortable({
    id: `folder-${folder.id}`,
    index,
    group: 'sidebar-toplevel',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accept: (draggable: any) => {
      const g = String(draggable?.group ?? '');
      return g === 'sidebar-toplevel' || g.startsWith('sidebar-folder-');
    },
  });

  // Drop zone for the folder's content area — accepts projects from any sidebar group.
  const { ref: childrenDropRef, isDropTarget: isChildrenDropTarget } = useDroppable({
    id: `folder-dropzone-${folder.id}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accept: (draggable: any) => {
      const g = String(draggable?.group ?? '');
      return g === 'sidebar-toplevel' || g.startsWith('sidebar-folder-');
    },
  });

  const isMergeTarget = mergeTarget === `folder-${folder.id}`;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // Keep renameValue in sync if folder.name changes externally
  useEffect(() => {
    if (!isRenaming) setRenameValue(folder.name);
  }, [folder.name, isRenaming]);

  // Handle external rename request from context menu
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
    <div ref={ref} data-drag-id={`folder-${folder.id}`} className={`${isDragging ? 'opacity-50' : ''}`}>
      {/* Folder header */}
      <div className={`relative group/folder rounded-md ${isMergeTarget ? 'ring-2 ring-blue-400 ring-inset bg-blue-50/40 dark:bg-blue-900/20' : ''}`}>
        <div className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 cursor-default select-none">
          {/* Drag handle */}
          <span
            ref={handleRef}
            className="cursor-grab active:cursor-grabbing flex-shrink-0"
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

          {/* Task count badge */}
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
          data-drag-id={`folder-dropzone-${folder.id}`}
          className={`ml-3 border-l border-gray-200 dark:border-gray-700 pl-1 mt-0.5 space-y-0.5 min-h-[8px] rounded-md ${
            isChildrenDropTarget && folder.projects.length === 0 ? 'ring-2 ring-dashed ring-blue-400 bg-blue-50/40 dark:bg-blue-900/20' : ''
          }`}
        >
          {folder.projects.map((project, i) => (
            <FolderProjectItem
              key={project.id}
              project={project}
              folderId={folder.id}
              index={i}
              userId={userId}
              navLinkClass={navLinkClass}
              onClose={onClose}
              onContextMenu={onProjectContextMenu}
              contextMenuProjectId={projectContextMenuId}
              taskCount={project.taskCount - project.completedTaskCount}
              onShareClick={onShareClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── InboxProjectItem ────────────────────────────────────────────────────────

function InboxProjectItem({ project, navLinkClass, onClose }: {
  project: ProjectResponse;
  navLinkClass: (props: { isActive: boolean }) => string;
  onClose: () => void;
}) {
  const { ref, isDropTarget } = useDroppable({ id: 'project-drop-' + project.id });
  const { source } = useDragOperation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isDraggingProject = (source as any)?.group === 'sidebar-toplevel' || String((source as any)?.group ?? '').startsWith('sidebar-folder-');
  return (
    <div ref={ref} data-project-drop-id={project.id} data-project-drop-name={project.name} className={`relative group rounded-md ${isDropTarget && !isDraggingProject ? 'ring-2 ring-blue-400 ring-inset' : ''}`}>
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

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({ open, onClose, desktopVisible = true }: SidebarProps) {
  const { user, gravatarUrl } = useAuth();
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
  const [hasAssignedTasks, setHasAssignedTasks] = useState<boolean | null>(null);
  const [smartListCounts, setSmartListCounts] = useState<Record<string, number>>({});
  const [navOverflows, setNavOverflows] = useState(false);
  // Merge intent state for drag-to-create folder
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  // Increments after every drop that reorders state, so we can remount the
  // project list and force dnd-kit's sortable DOM to re-sync with React's
  // rendered order. Without this, dnd-kit holds stale post-drag positions.
  const [layoutVersion, setLayoutVersion] = useState(0);
  // Folder being externally triggered for rename (from context menu)
  const [folderRenaming, setFolderRenaming] = useState<string | null>(null);
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

  const fetchFolders = useCallback(async () => {
    try {
      const data = await listFolders();
      setFolders(data);
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

  const fetchAssignedCount = useCallback(async () => {
    try {
      const [today, tomorrow, next7days, allTasks, priorityTasks, assigned] = await Promise.all([
        getSmartList('today'),
        getSmartList('tomorrow'),
        getSmartList('next7days'),
        user?.showAllTasksList ? getSmartList('all') : Promise.resolve([]),
        user?.showPriorityTasksList ? getSmartList('priority') : Promise.resolve([]),
        getSmartList('assigned-to-me'),
      ]);
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
      setHasAssignedTasks(null);
    }
  }, [user?.showAllTasksList, user?.showPriorityTasksList]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchFolders(); }, [fetchFolders]);
  useEffect(() => { fetchTags(); }, [fetchTags]);
  useEffect(() => { fetchAssignedCount(); }, [fetchAssignedCount]);
  useEffect(() => { checkNavOverflow(); }, [projects, folders, tags, checkNavOverflow]);

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
    // Optimistic update
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

  // ── Drag-drop monitor ──────────────────────────────────────────────────────

  // Stable refs for use inside drag monitor callbacks
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  // Derived data
  const inboxProject = projects.find(p => p.isInbox);
  const ungroupedProjects = projects.filter(p => !p.isInbox && p.folderId === null);

  // Top-level sidebar items: folders + ungrouped projects, interleaved by sortOrder
  const topLevelItems: SidebarTopLevelItem[] = [
    ...folders.map(f => ({ type: 'folder' as const, id: `folder-${f.id}`, sortOrder: f.sortOrder, folder: f })),
    ...ungroupedProjects.map(p => ({ type: 'project' as const, id: p.id, sortOrder: p.sortOrder, project: p })),
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  const topLevelItemsRef = useRef(topLevelItems);
  topLevelItemsRef.current = topLevelItems;

  // Accumulates intended order during a top-level drag (folders + ungrouped projects)
  const runningTopLevelOrderRef = useRef<SidebarTopLevelItem[] | null>(null);
  // Accumulates intended order during a within-folder drag
  const runningFolderOrderRef = useRef<{ folderId: string; projects: ProjectResponse[] } | null>(null);

  // Merge intent state (refs for use in monitor, state for triggering visual re-render)
  const mergeTargetIdRef = useRef<string | null>(null);
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mergeIntentRef = useRef(false);
  // Last target the DOM-based resolver picked during the drag. Used both to
  // detect the "dropped on folder header" shortcut and to compute the final sort
  // order at drop time (see computeTopLevelDropOrder).
  const lastTargetIdRef = useRef<string | null>(null);


  // Same idea as computeTopLevelDropOrder but for projects inside a single folder.
  const computeFolderDropOrder = (
    folder: ProjectFolderResponse,
    sourceId: string,
    neighborId: string | null,
  ): ProjectResponse[] | null => {
    if (!neighborId) return null;
    const sourceProject = folder.projects.find(p => p.id === sourceId);
    if (!sourceProject) return null;
    const sourceIdx = folder.projects.findIndex(p => p.id === sourceId);
    const neighborIdx = folder.projects.findIndex(p => p.id === neighborId);
    if (sourceIdx === -1 || neighborIdx === -1) return null;
    const without = folder.projects.filter(p => p.id !== sourceId);
    const withoutNeighborIdx = without.findIndex(p => p.id === neighborId);
    if (withoutNeighborIdx === -1) return null;
    const insertIdx = sourceIdx < neighborIdx ? withoutNeighborIdx + 1 : withoutNeighborIdx;
    const result = [...without];
    result.splice(insertIdx, 0, sourceProject);
    return result;
  };

  // Find the sidebar draggable target nearest a given screen point, skipping
  // the source's own element. If the point is inside a non-source element's rect,
  // return that element's id (preferring the innermost nested match). Otherwise
  // fall back to the non-source element whose rect is closest in Y — this matters
  // when the sidebar auto-scrolls during a drag and the cursor ends past the last
  // visible item.
  const resolveTargetAtPoint = (x: number, y: number, sourceId: string): string | null => {
    const candidates = Array.from(document.querySelectorAll('[data-drag-id]'));
    let bestInsideId: string | null = null;
    let bestInsideArea: number = Infinity;
    let closestId: string | null = null;
    let closestDy: number = Infinity;
    for (const el of candidates) {
      const id = el.getAttribute('data-drag-id');
      if (!id || id === sourceId) continue;
      const r = (el as HTMLElement).getBoundingClientRect();
      // Prefer innermost match when inside a rect.
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const area = r.width * r.height;
        if (area < bestInsideArea) {
          bestInsideArea = area;
          bestInsideId = id;
        }
      }
      // Track closest-in-y fallback (only consider rects horizontally overlapping the pointer).
      if (x >= r.left && x <= r.right) {
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        if (dy < closestDy) {
          closestDy = dy;
          closestId = id;
        }
      }
    }
    return bestInsideId ?? closestId;
  };

  const cancelMerge = useCallback(() => {
    if (mergeTimerRef.current) {
      clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    mergeTargetIdRef.current = null;
    mergeIntentRef.current = false;
    setMergeTarget(prev => prev === null ? prev : null);
  }, []);

  useDragDropMonitor({
    onDragStart() {
      dragOccurred = true;
      runningTopLevelOrderRef.current = null;
      runningFolderOrderRef.current = null;
      cancelMerge();
      lastTargetIdRef.current = null;
      // No native pointermove listener here — it races with dnd-kit's optimistic
      // sort swap (target element moves after each onDragOver, so the cursor ends up
      // outside its new rect even though the user hasn't moved). dnd-kit's own
      // onDragOver is the only reliable target-change signal.
    },

    onDragOver(event) {
      const { operation } = event;
      if (!isSortableOperation(operation)) return;
      const { source, target } = operation;
      if (!source || !target) return;

      const sourceGroup = String(source.group ?? '');
      const sourceId = String(source.id);
      const targetId = String(target.id);
      if (sourceId === targetId) return;

      // ── Sort swap accumulation (same-group only) ────────────────────────────
      // This mirrors dnd-kit's sortable intent and produces a coherent final order
      // at onDragEnd. We rely on dnd-kit's onDragOver target progression here
      // because it's the only signal that's consistent with its own visual shuffle.
      if (sourceGroup === 'sidebar-toplevel') {
        const base = runningTopLevelOrderRef.current ?? topLevelItemsRef.current;
        const fromIndex = base.findIndex(item => item.id === sourceId);
        const toIndex = base.findIndex(item => item.id === targetId);
        if (fromIndex !== -1 && toIndex !== -1) {
          const reordered = [...base];
          const [moved] = reordered.splice(fromIndex, 1);
          reordered.splice(toIndex, 0, moved);
          runningTopLevelOrderRef.current = reordered;
        }
      } else if (sourceGroup.startsWith('sidebar-folder-')) {
        const folderId = sourceGroup.replace('sidebar-folder-', '');
        const folder = foldersRef.current.find(f => f.id === folderId);
        if (!folder) return;
        const currentBase = runningFolderOrderRef.current?.folderId === folderId
          ? runningFolderOrderRef.current.projects
          : folder.projects;
        const fromIndex = currentBase.findIndex(p => p.id === sourceId);
        const toIndex = currentBase.findIndex(p => p.id === targetId);
        if (fromIndex === -1 || toIndex === -1) return;
        const reordered = [...currentBase];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        runningFolderOrderRef.current = { folderId, projects: reordered };
      }
    },

    onDragMove(event) {
      const { operation } = event;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyOp = operation as any;
      const source = anyOp?.source;
      if (!source) return;

      const sourceId = String(source.id);

      // dnd-kit's sortable collision detection is unreliable for our use case
      // (the source element tracks the cursor and always wins as closest). Resolve
      // target from the DOM using the live pointer position instead.
      const pos = anyOp?.position?.current;
      if (!pos) return;
      const targetId = resolveTargetAtPoint(pos.x, pos.y, sourceId);

      if (targetId === lastTargetIdRef.current) return;
      // null target ≠ cancellation — keep any armed merge target alive during
      // transient "no hover" frames.
      if (targetId == null) return;

      lastTargetIdRef.current = targetId;

      const isTargetDropzone = targetId.startsWith('folder-dropzone-');
      const isTargetFolderHeader = targetId.startsWith('folder-') && !isTargetDropzone;

      // ── Merge candidacy ─────────────────────────────────────────────────────
      if (sourceId.startsWith('folder-')) { cancelMerge(); return; }
      if (isTargetDropzone) { cancelMerge(); return; }

      const sourceProject = projectsRef.current.find(p => p.id === sourceId);
      if (!sourceProject || sourceProject.isInbox || sourceProject.ownerId !== user?.id) {
        cancelMerge();
        return;
      }

      const targetProject = !isTargetFolderHeader
        ? projectsRef.current.find(p => p.id === targetId)
        : undefined;
      const isTargetValidProject = !!targetProject && !targetProject.isInbox && targetProject.ownerId === user?.id;
      if (!isTargetFolderHeader && !isTargetValidProject) {
        cancelMerge();
        return;
      }

      // Arm a 1000 ms hover timer whenever the merge-eligible target changes.
      if (mergeTimerRef.current) {
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
      mergeIntentRef.current = false;
      mergeTargetIdRef.current = targetId;
      setMergeTarget(prev => prev === null ? prev : null);
      mergeTimerRef.current = setTimeout(() => {
        mergeIntentRef.current = true;
        setMergeTarget(targetId);
      }, 1000);
    },

    onDragEnd(event) {
      // Clear the drag flag after a tick so it's still true when the post-drag click fires.
      setTimeout(() => { dragOccurred = false; }, 0);

      // Capture merge state BEFORE clearing — fixes race where the 1000ms timer fires
      // between the last onDragOver and onDragEnd.
      const mergeLatched = mergeIntentRef.current;
      const capturedMergeTarget = mergeTargetIdRef.current;
      const capturedLastTarget = lastTargetIdRef.current;
      cancelMerge();
      lastTargetIdRef.current = null;

      const { operation } = event;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const source = operation.source as any;
      if (!source) {
        runningTopLevelOrderRef.current = null;
        runningFolderOrderRef.current = null;
        return;
      }

      const sourceId = String(source.id);
      const sourceProject = projectsRef.current.find(p => p.id === sourceId);
      const origFolderId = sourceProject?.folderId ?? null;
      const isSourceFolder = sourceId.startsWith('folder-');

      // ── Branch 1: Merge intent latched (hover timer fired) ──────────────────
      if (mergeLatched && capturedMergeTarget && !isSourceFolder) {
        runningTopLevelOrderRef.current = null;
        runningFolderOrderRef.current = null;
        setLayoutVersion(v => v + 1);

        const doRemoveFromOrig = origFolderId
          ? removeProjectFromFolder(origFolderId, sourceId)
          : Promise.resolve();

        if (capturedMergeTarget.startsWith('folder-') && !capturedMergeTarget.startsWith('folder-dropzone-')) {
          const targetFolderId = capturedMergeTarget.replace('folder-', '');
          if (targetFolderId === origFolderId) { fetchAll(); return; }
          doRemoveFromOrig
            .then(() => addProjectToFolder(targetFolderId, sourceId))
            .then(() => fetchAll())
            .catch(() => { toast.error('Failed to add to folder'); fetchAll(); });
        } else {
          // Project → project: create a new folder containing both.
          // If source was in a folder, remove it first.
          doRemoveFromOrig
            .then(() => createFolder('New Folder', [sourceId, capturedMergeTarget]))
            .then(() => fetchAll())
            .catch(() => { toast.error('Failed to create folder'); fetchAll(); });
        }
        return;
      }

      // ── Branch 2: Dropped on a folder header (no hover timer needed) ───────
      // Also covers dropping on the empty-folder drop zone.
      if (!isSourceFolder && capturedLastTarget) {
        const isFolderHeader = capturedLastTarget.startsWith('folder-') && !capturedLastTarget.startsWith('folder-dropzone-');
        const isDropzone = capturedLastTarget.startsWith('folder-dropzone-');
        if (isFolderHeader || isDropzone) {
          const targetFolderId = isFolderHeader
            ? capturedLastTarget.replace('folder-', '')
            : capturedLastTarget.replace('folder-dropzone-', '');
          if (targetFolderId === origFolderId) {
            // No-op move — fall through to reorder branches below.
          } else if (isFolderHeader && origFolderId === null && runningTopLevelOrderRef.current) {
            // Top-level source dropped near a folder header, but dnd-kit's sort has
            // accumulated a valid top-level order. The cursor landed on the folder
            // because it was dropped just above/below it — trust the sort and fall
            // through to Branch 3. (Add to folder: hover 1000ms or drag into expanded dropzone.)
          } else {
            runningTopLevelOrderRef.current = null;
            runningFolderOrderRef.current = null;
            setLayoutVersion(v => v + 1);
            const doRemove = origFolderId
              ? removeProjectFromFolder(origFolderId, sourceId)
              : Promise.resolve();
            doRemove
              .then(() => addProjectToFolder(targetFolderId, sourceId))
              .then(() => fetchAll())
              .catch(() => { toast.error('Failed to add to folder'); fetchAll(); });
            return;
          }
        }
      }

      // ── Branch 3: Top-level source (folder headers or ungrouped projects) ──
      if (origFolderId === null) {
        // Use the progressively-accumulated order from onDragOver as the source
        // of truth. The previous DOM-based resolver approach (lastTargetIdRef /
        // computeTopLevelDropOrder) had an off-by-one bug: after dnd-kit
        // visually swaps the source with a neighbor, onDragMove fires with the
        // cursor inside the source's new visual rect. resolveTargetAtPoint would
        // skip the source and pick the element immediately BELOW the intended
        // landing spot, causing the item to hop one position too far. Using
        // runningTopLevelOrderRef (updated cumulatively in onDragOver) avoids
        // this race entirely and also handles folders in the drag path correctly.
        const intended = runningTopLevelOrderRef.current;
        runningTopLevelOrderRef.current = null;
        runningFolderOrderRef.current = null;

        if (!intended) return;

        const originalPos = topLevelItemsRef.current.findIndex(item => item.id === sourceId);
        const intendedPos = intended.findIndex(item => item.id === sourceId);
        if (originalPos === -1 || intendedPos === -1 || originalPos === intendedPos) return;

        // Optimistic update
        fetchVersionRef.current++;
        setProjects(prev => {
          const updated = [...prev];
          intended.forEach((item, i) => {
            if (item.type === 'project') {
              const idx = updated.findIndex(p => p.id === item.project.id);
              if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i };
            }
          });
          return updated;
        });
        setFolders(prev => {
          const updated = [...prev];
          intended.forEach((item, i) => {
            if (item.type === 'folder') {
              const idx = updated.findIndex(f => f.id === item.folder.id);
              if (idx !== -1) updated[idx] = { ...updated[idx], sortOrder: i };
            }
          });
          return updated;
        });

        setLayoutVersion(v => v + 1);
        reorderTopLevel(intended.map(item => ({
          type: item.type,
          id: item.type === 'folder' ? item.folder.id : item.project.id,
        })))
          .then(() => fetchAll())
          .catch(() => {
            toast.error('Failed to save order');
            fetchAll();
          });
        return;
      }

      // ── Branch 4: Folder-interior source ───────────────────────────────────
      if (origFolderId) {
        runningFolderOrderRef.current = null;
        runningTopLevelOrderRef.current = null;

        // If the last target was a sibling inside the same folder, reorder within folder.
        const lastTargetInSameFolder = capturedLastTarget
          && !capturedLastTarget.startsWith('folder-')
          && foldersRef.current
              .find(f => f.id === origFolderId)?.projects.some(p => p.id === capturedLastTarget);

        if (lastTargetInSameFolder) {
          const folder = foldersRef.current.find(f => f.id === origFolderId);
          if (!folder) return;
          const intended = computeFolderDropOrder(folder, sourceId, capturedLastTarget);
          if (!intended) return;
          const originalPos = folder.projects.findIndex(p => p.id === sourceId);
          const intendedPos = intended.findIndex(p => p.id === sourceId);
          if (originalPos === -1 || intendedPos === -1 || originalPos === intendedPos) return;

          setFolders(prev => prev.map(f => f.id === origFolderId ? { ...f, projects: intended } : f));
          setLayoutVersion(v => v + 1);
          reorderFolderProjects(origFolderId, intended.map(p => p.id)).catch(() => {
            toast.error('Failed to save order');
            fetchFolders();
          });
          return;
        }

        // Dropped outside the source folder (and not onto a folder header — branches 1/2
        // would have fired) → remove from folder; project becomes ungrouped.
        if (capturedLastTarget && capturedLastTarget !== sourceId) {
          setLayoutVersion(v => v + 1);
          removeProjectFromFolder(origFolderId, sourceId)
            .then(() => fetchAll())
            .catch(() => { toast.error('Failed to remove from folder'); fetchAll(); });
        }
      }
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-blue-100 dark:bg-gray-700 text-blue-700 dark:text-gray-100 font-medium'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
    }`;

  const allProjects = projects; // for looking up a project by id in context menus

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
          <p className="px-3 py-1 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Smart Lists
          </p>
          {smartLists
            .filter(({ key, to }) =>
              (key !== 'all' || user?.showAllTasksList !== false) &&
              (key !== 'priority' || user?.showPriorityTasksList === true) &&
              (to !== '/app/assigned' || hasAssignedTasks !== false)
            )
            .map(({ to, label, icon: Icon, key }) => (
              <NavLink key={to} to={to} className={navLinkClass} onClick={onClose}>
                <Icon size={18} className="flex-shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {smartListCounts[key] > 0 && (
                  <span className="text-xs text-gray-400">{smartListCounts[key]}</span>
                )}
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
              className="text-gray-400 hover:text-blue-500 transition-colors -mr-1"
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

              {/* Top-level items: interleaved folders + ungrouped projects.
                  Wrapped in a keyed Fragment so bumping layoutVersion after a
                  drop forces the sortable subtree to remount — needed because
                  dnd-kit's sortable DOM can otherwise hold stale post-drag
                  positions that don't match React's rendered order. */}
              <React.Fragment key={`toplevel-${layoutVersion}`}>
              {topLevelItems.map((item, index) =>
                item.type === 'folder' ? (
                  <SortableFolderItem
                    key={item.folder.id}
                    folder={item.folder}
                    index={index}
                    mergeTarget={mergeTarget}
                    userId={user?.id}
                    navLinkClass={navLinkClass}
                    onClose={onClose}
                    onRename={handleRenameFolder}
                    onFolderContextMenu={(folderId, rect) =>
                      setFolderContextMenu(folderContextMenu?.folderId === folderId ? null : { folderId, rect })
                    }
                    folderContextMenuId={folderContextMenu?.folderId ?? null}
                    onProjectContextMenu={(projectId, folderId, rect) =>
                      setContextMenu(contextMenu?.projectId === projectId ? null : { projectId, folderId, rect })
                    }
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
                    index={index}
                    userId={user?.id}
                    navLinkClass={navLinkClass}
                    onClose={onClose}
                    onContextMenu={(projectId, folderId, rect) =>
                      setContextMenu(contextMenu?.projectId === projectId ? null : { projectId, folderId, rect })
                    }
                    contextMenuProjectId={contextMenu?.projectId ?? null}
                    taskCount={item.project.taskCount - item.project.completedTaskCount}
                    onShareClick={setSharingProject}
                    mergeTarget={mergeTarget}
                  />
                )
              )}
              </React.Fragment>
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
              className="text-gray-400 hover:text-blue-500 transition-colors -mr-1"
              title="New tag"
            >
              <Plus size={16} />
            </button>
          </div>
            {tags.filter(t => t.taskCount > 0).map(tag => (
              <div key={tag.id} className="relative group/tag flex items-center">
                <NavLink
                  to={`/app/tags/${tag.id}`}
                  className={({ isActive }) => navLinkClass({ isActive }) + ' flex-1 min-w-0'}
                  onClick={onClose}
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

        <div className="pb-3 pt-1 text-center">
          <p className="text-xs text-gray-300 dark:text-gray-600 select-none">
            v{__APP_VERSION__}
          </p>
        </div>

      </aside>

      {/* Project context menu */}
      {contextMenu && createPortal(
        <>
          <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[140px]"
            style={{
              top: contextMenu.rect.bottom + 4 + (contextMenu.folderId ? 140 : 115) > window.innerHeight
                ? contextMenu.rect.top - (contextMenu.folderId ? 140 : 115)
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
                // Trigger inline rename by finding the folder and simulating double-click
                // We signal via a rename-request state instead
                setFolderContextMenu(null);
                // We'll use a separate state to trigger rename
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
              top: tagContextMenu.rect.bottom + 4 + 80 > window.innerHeight
                ? tagContextMenu.rect.top - 80
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
