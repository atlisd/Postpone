import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getProjectMembers, shareProject, unshareProject } from '../../api/projects';
import type { ProjectMember } from '../../api/projects';
import { listUsers } from '../../api/users';
import type { UserSummary } from '../../api/users';
import type { ProjectResponse } from '../../types/api';
import { useAuth } from '../../contexts/AuthContext';

interface ProjectShareModalProps {
  project: ProjectResponse;
  onClose: () => void;
}

export function ProjectShareModal({ project, onClose }: ProjectShareModalProps) {
  const { user } = useAuth();
  const isOwner = user?.id === project.ownerId;

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allUsers, setAllUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const fetches: Promise<unknown>[] = [getProjectMembers(project.id)];
    if (isOwner) fetches.push(listUsers());
    Promise.all(fetches)
      .then(([m, u]) => {
        setMembers(m as ProjectMember[]);
        if (u) setAllUsers(u as UserSummary[]);
      })
      .catch(() => toast.error('Failed to load sharing info'))
      .finally(() => setLoading(false));
  }, [project.id, isOwner]);

  const availableUsers = allUsers.filter(u => !members.some(m => m.userId === u.id));

  const handleAdd = async () => {
    if (!selectedUserId) return;
    setAdding(true);
    try {
      await shareProject(project.id, selectedUserId);
      const updated = await getProjectMembers(project.id);
      setMembers(updated);
      setSelectedUserId('');
      toast.success('Project shared');
    } catch {
      toast.error('Failed to share project');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (userId: string, displayName: string) => {
    setRemovingId(userId);
    try {
      await unshareProject(project.id, userId);
      setMembers(prev => prev.filter(m => m.userId !== userId));
      toast.success(`Removed ${displayName}`);
    } catch {
      toast.error('Failed to remove access');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isOwner ? `Share "${project.name}"` : `Who can see "${project.name}"`}
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        {!isOwner && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            This project has been shared with you. Only the owner can change access.
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                People with access
              </p>
              <div className="space-y-1">
                {members.map(member => {
                  const isMemberOwner = member.userId === project.ownerId;
                  const isRemoving = removingId === member.userId;
                  return (
                    <div key={member.userId} className="flex items-center gap-3 py-1.5">
                      <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">
                        {member.displayName[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{member.displayName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                      </div>
                      {isMemberOwner ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Owner</span>
                      ) : isOwner ? (
                        <button
                          onClick={() => handleRemove(member.userId, member.displayName)}
                          disabled={isRemoving}
                          aria-label={`Remove ${member.displayName}`}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 shrink-0 disabled:opacity-50"
                        >
                          {isRemoving ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                          {member.userId === user?.id ? 'You' : 'Can edit'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {isOwner && availableUsers.length > 0 && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700" />
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    Add person
                  </p>
                  <div className="flex gap-2">
                    <select
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a person...</option>
                      {availableUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.displayName}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleAdd}
                      disabled={!selectedUserId || adding}
                      className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-medium flex items-center gap-1.5"
                    >
                      {adding ? <Loader2 size={14} className="animate-spin" /> : null}
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}

            {isOwner && members.length <= 1 && availableUsers.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
                No other users to share with.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
