import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { getHousehold, updateHousehold, deleteHousehold, regenerateInviteCode, removeMember } from '../../api/households';
import type { HouseholdResponse } from '../../api/households';
import { useAuth } from '../../contexts/AuthContext';
import { Copy, RefreshCw, Trash2, LogOut, Users } from 'lucide-react';
import { toast } from 'sonner';

export function HouseholdPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [household, setHousehold] = useState<HouseholdResponse | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  const isOwner = household?.createdById === user?.id;

  const fetchData = async () => {
    if (!id) return;
    try {
      const data = await getHousehold(id);
      setHousehold(data);
      setName(data.name);
    } catch {
      toast.error('Failed to load household');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handleSaveName = async () => {
    if (!id || !name.trim()) return;
    try {
      await updateHousehold(id, name.trim());
      setEditingName(false);
      await fetchData();
    } catch {
      toast.error('Failed to update name');
    }
  };

  const handleRegenerateCode = async () => {
    if (!id || !confirm('Generate a new invite code? The old code will stop working.')) return;
    try {
      const result = await regenerateInviteCode(id);
      setHousehold(prev => prev ? { ...prev, inviteCode: result.inviteCode } : prev);
      toast.success('Invite code regenerated');
    } catch {
      toast.error('Failed to regenerate code');
    }
  };

  const handleCopyCode = () => {
    if (!household) return;
    navigator.clipboard.writeText(household.inviteCode);
    toast.success('Invite code copied');
  };

  const handleRemoveMember = async (userId: string, displayName: string) => {
    if (!id || !confirm(`Remove ${displayName} from this household?`)) return;
    try {
      await removeMember(id, userId);
      await fetchData();
      toast.success(`${displayName} removed`);
    } catch {
      toast.error('Failed to remove member');
    }
  };

  const handleLeave = async () => {
    if (!id || !user || !confirm('Leave this household?')) return;
    try {
      await removeMember(id, user.id);
      navigate('/app/today');
      toast.success('Left household');
    } catch {
      toast.error('Failed to leave household');
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Delete this household? All shared projects will become private.')) return;
    try {
      await deleteHousehold(id);
      navigate('/app/today');
      toast.success('Household deleted');
    } catch {
      toast.error('Failed to delete household');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!household) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Users size={24} className="text-blue-600" />
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl font-bold bg-transparent border-b-2 border-blue-500 outline-none text-gray-900 dark:text-white"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
            />
            <button onClick={handleSaveName} className="text-sm text-blue-600 hover:text-blue-700">Save</button>
          </div>
        ) : (
          <h1
            className="text-2xl font-bold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600"
            onClick={() => isOwner && setEditingName(true)}
            title={isOwner ? 'Click to edit' : undefined}
          >
            {household.name}
          </h1>
        )}
      </div>

      {/* Invite Code */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Invite Code</h3>
        <div className="flex items-center gap-3">
          <code className="text-2xl font-mono font-bold tracking-widest text-blue-600 dark:text-gray-200 select-all">
            {household.inviteCode}
          </code>
          <button onClick={handleCopyCode} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Copy">
            <Copy size={16} />
          </button>
          {isOwner && (
            <button onClick={handleRegenerateCode} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Regenerate">
              <RefreshCw size={16} />
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">Share this code with family members so they can join.</p>
      </div>

      {/* Members */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Members ({household.members.length})
        </h3>
        <div className="space-y-2">
          {household.members.map(member => (
            <div key={member.userId} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div>
                <span className="text-sm font-medium text-gray-900 dark:text-white">{member.displayName}</span>
                <span className="text-xs text-gray-500 ml-2">{member.email}</span>
                {member.role === 'owner' && (
                  <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-gray-700 text-blue-600 dark:text-gray-200">
                    Owner
                  </span>
                )}
              </div>
              {isOwner && member.userId !== user?.id && (
                <button
                  onClick={() => handleRemoveMember(member.userId, member.displayName)}
                  className="p-1.5 text-gray-400 hover:text-red-500"
                  title="Remove member"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {!isOwner && (
          <button
            onClick={handleLeave}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-red-500"
          >
            <LogOut size={16} />
            Leave household
          </button>
        )}
        {isOwner && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600"
          >
            <Trash2 size={16} />
            Delete household
          </button>
        )}
      </div>
    </div>
  );
}
