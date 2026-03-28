import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { listUsers, createUser, deleteUser, regenerateInvitation, generatePasswordResetLink } from '../../api/admin';
import type { AdminUser } from '../../types/api';
import { Plus, Trash2, RotateCcw, Copy, Link } from 'lucide-react';

function buildLink(path: string, token: string) {
  return `${window.location.origin}${path}?token=${token}`;
}

export function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedLinkLabel, setGeneratedLinkLabel] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const fetchUsers = async () => {
    try {
      const data = await listUsers();
      setUsers(data);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  if (!user?.isAdmin) {
    return <div className="p-6 text-red-600">Access denied</div>;
  }

  const showLink = (link: string, label: string) => {
    setGeneratedLink(link);
    setGeneratedLinkLabel(label);
    setCopySuccess(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const result = await createUser({ email, displayName });
      setShowCreate(false);
      setEmail('');
      setDisplayName('');
      await fetchUsers();
      showLink(buildLink('/accept-invitation', result.invitationToken), 'Invitation link for ' + result.displayName);
    } catch {
      setError('Failed to create user. Email may already exist.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await deleteUser(id);
      await fetchUsers();
    } catch {
      setError('Failed to delete user');
    }
  };

  const handleRegenerateInvitation = async (id: string, name: string) => {
    try {
      const result = await regenerateInvitation(id);
      showLink(buildLink('/accept-invitation', result.token), 'Invitation link for ' + name);
    } catch {
      setError('Failed to generate invitation link');
    }
  };

  const handleGenerateResetLink = async (id: string, name: string) => {
    try {
      const result = await generatePasswordResetLink(id);
      showLink(buildLink('/reset-password', result.token), 'Password reset link for ' + name);
    } catch {
      setError('Failed to generate reset link');
    }
  };

  const handleCopy = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h2>
        <button
          onClick={() => { setShowCreate(!showCreate); setGeneratedLink(null); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm p-3 rounded mb-4">
          {error}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md">
              Create
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm rounded-md">
              Cancel
            </button>
          </div>
        </form>
      )}

      {generatedLink && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">{generatedLinkLabel}</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">Expires in 1 hour · Single use</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={generatedLink}
              onFocus={(e) => e.target.select()}
              className="flex-1 px-3 py-2 text-xs border border-blue-300 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            />
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md whitespace-nowrap"
            >
              <Copy size={14} />
              {copySuccess ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setGeneratedLink(null)}
            className="mt-2 text-xs text-blue-500 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">
                  {u.displayName}
                  {u.isAdmin && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded">
                      Admin
                    </span>
                  )}
                  {!u.hasPassword && (
                    <span className="ml-2 px-1.5 py-0.5 text-xs bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 rounded">
                      Pending invitation
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
              </div>
              {u.id !== user.id && (
                <div className="flex gap-1">
                  {!u.hasPassword ? (
                    <button
                      onClick={() => handleRegenerateInvitation(u.id, u.displayName)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                      title="Regenerate invitation link"
                    >
                      <Link size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleGenerateResetLink(u.id, u.displayName)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded"
                      title="Generate password reset link"
                    >
                      <RotateCcw size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(u.id, u.displayName)}
                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded"
                    title="Delete user"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
