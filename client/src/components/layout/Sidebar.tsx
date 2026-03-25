import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useNavigate, useLocation } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSignalR } from '../../hooks/useSignalR';
import { listProjects, createProject, deleteProject } from '../../api/projects';
import { ProjectFormModal } from '../projects/ProjectFormModal';
import type { ProjectResponse } from '../../types/api';
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
} from 'lucide-react';
import { toast } from 'sonner';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const smartLists = [
  { to: '/app/today', label: 'Today', icon: Sun },
  { to: '/app/tomorrow', label: 'Tomorrow', icon: Sunrise },
  { to: '/app/next7days', label: 'Next 7 Days', icon: Calendar },
  { to: '/app/all', label: 'All Tasks', icon: List },
  { to: '/app/assigned', label: 'Assigned to Me', icon: UserCheck },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ projectId: string; rect: DOMRect } | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await listProjects();
      setProjects(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
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

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? 'bg-blue-100 dark:bg-gray-700 text-blue-700 dark:text-gray-100 font-medium'
        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

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
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
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
            projects.map(project => (
              <div key={project.id} className="relative group">
                <NavLink
                  to={`/app/projects/${project.id}`}
                  className={navLinkClass}
                  onClick={onClose}
                >
                  <FolderOpen size={16} style={{ color: project.color }} />
                  <span className="flex-1 truncate">{project.name}</span>
                  {project.householdId && <Users size={12} className="text-gray-400 flex-shrink-0" />}
                  <span className="text-xs text-gray-400 group-hover:invisible">
                    {project.taskCount - project.completedTaskCount}
                  </span>
                </NavLink>
                {project.ownerId === user?.id && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setContextMenu(contextMenu?.projectId === project.id ? null : { projectId: project.id, rect });
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </nav>

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
