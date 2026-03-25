import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { updateProfile, setPushoverKey, changePassword } from '../../api/auth';
import { Settings, Bell, Lock, Monitor, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'Auto', icon: Monitor },
];

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [pushoverKey, setPushoverKeyState] = useState(user?.pushoverUserKey ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ displayName, timezone });
      await refreshUser();
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePushover = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setPushoverKey(pushoverKey || null);
      await refreshUser();
      toast.success('Pushover key updated');
    } catch {
      toast.error('Failed to update Pushover key');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch {
      toast.error('Failed to change password. Check your current password.');
    }
  };

  const timezones = Intl.supportedValuesOf('timeZone');

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center gap-3">
        <Settings size={24} className="text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
      </div>

      {/* Profile */}
      <form onSubmit={handleSaveProfile} className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Profile</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {timezones.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </form>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Appearance */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Monitor size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Appearance</h2>
        </div>

        <div className="flex gap-2">
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-md border transition-colors ${
                theme === value
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          {theme === 'auto' ? 'Theme follows your system preference.' : `Using ${theme} theme.`}
        </p>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Pushover */}
      <form onSubmit={handleSavePushover} className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pushover User Key</label>
          <input
            value={pushoverKey}
            onChange={(e) => setPushoverKeyState(e.target.value)}
            placeholder="Enter your Pushover user key"
            className="w-full px-3 py-2 text-sm font-mono border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <p className="text-xs text-gray-500 mt-1">
            Get your user key from pushover.net. You'll receive notifications for tasks due today.
          </p>
        </div>

        <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Save Pushover key
        </button>
      </form>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Change Password */}
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Change Password</h2>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Change password
        </button>
      </form>
    </div>
  );
}
