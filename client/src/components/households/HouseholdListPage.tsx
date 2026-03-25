import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { listHouseholds, createHousehold, joinHousehold } from '../../api/households';
import type { HouseholdSummary } from '../../api/households';
import { Users, Plus, LogIn } from 'lucide-react';
import { toast } from 'sonner';

export function HouseholdListPage() {
  const navigate = useNavigate();
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await listHouseholds();
      setHouseholds(data);
    } catch {
      toast.error('Failed to load households');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const result = await createHousehold(newName.trim());
      setNewName('');
      setShowCreate(false);
      navigate(`/app/household/${result.id}`);
    } catch {
      toast.error('Failed to create household');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    try {
      const result = await joinHousehold(inviteCode.trim());
      setInviteCode('');
      setShowJoin(false);
      navigate(`/app/household/${result.id}`);
      toast.success(`Joined ${result.name}`);
    } catch {
      toast.error('Invalid invite code');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Households</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowJoin(true); setShowCreate(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <LogIn size={14} />
            Join
          </button>
          <button
            onClick={() => { setShowCreate(true); setShowJoin(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus size={14} />
            Create
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Household name</label>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Smith Family"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              autoFocus
            />
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Create</button>
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {showJoin && (
        <form onSubmit={handleJoin} className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite code</label>
          <div className="flex gap-2">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="Enter 8-character code"
              maxLength={8}
              className="flex-1 px-3 py-2 text-sm font-mono tracking-widest border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white uppercase"
              autoFocus
            />
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Join</button>
            <button type="button" onClick={() => setShowJoin(false)} className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {households.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <Users size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-lg">No households yet</p>
          <p className="text-sm mt-1">Create a household or join one with an invite code</p>
        </div>
      ) : (
        <div className="space-y-2">
          {households.map(household => (
            <button
              key={household.id}
              onClick={() => navigate(`/app/household/${household.id}`)}
              className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <Users size={20} className="text-blue-600" />
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{household.name}</span>
                  <p className="text-xs text-gray-500">{household.memberCount} member{household.memberCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
