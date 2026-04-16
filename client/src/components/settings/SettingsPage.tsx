import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import { updateProfile, setPushoverKey, changePassword, setNotificationPreferences } from '../../api/auth';
import { Settings, Bell, Lock, Monitor, Sun, Moon, Users, Home } from 'lucide-react';
import { toast } from 'sonner';
import { useLocale, SUPPORTED_LOCALES } from '../../contexts/LocaleContext';

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'Auto', icon: Monitor },
];

export function SettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { formatHour } = useLocale();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC');
  const [locale, setLocaleState] = useState(user?.locale ?? 'en');
  const [useGravatar, setUseGravatar] = useState(user?.useGravatar ?? false);
  const [showAllTasksList, setShowAllTasksList] = useState(user?.showAllTasksList ?? true);
  const [showPriorityTasksList, setShowPriorityTasksList] = useState(user?.showPriorityTasksList ?? false);
  const [pushoverKey, setPushoverKeyState] = useState(user?.pushoverUserKey ?? '');
  const [overdueNotificationsEnabled, setOverdueNotificationsEnabled] = useState(user?.overdueNotificationsEnabled ?? true);
  const [overdueNotificationHour, setOverdueNotificationHour] = useState(user?.overdueNotificationHour ?? 8);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ displayName, timezone, locale, useGravatar, showAllTasksList, showPriorityTasksList });
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

  const handleSaveNotificationPreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setNotificationPreferences({ overdueNotificationsEnabled, overdueNotificationHour });
      await refreshUser();
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save notification preferences');
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

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Language & format</label>
          <select
            value={locale}
            onChange={(e) => setLocaleState(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {SUPPORTED_LOCALES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">Controls date, time, and number formatting throughout the app.</p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={useGravatar}
            onChange={(e) => setUseGravatar(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Use Gravatar profile picture</span>
        </label>
        <p className="text-xs text-gray-500 -mt-2">Gravatar uses your email address to find a profile picture at gravatar.com</p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showAllTasksList}
            onChange={(e) => setShowAllTasksList(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Show "All Tasks" in the sidebar</span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showPriorityTasksList}
            onChange={(e) => setShowPriorityTasksList(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Show "Priority Tasks" in the sidebar</span>
        </label>

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
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-400'
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

      {/* Households */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Home size={20} className="text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Households</h2>
        </div>
        <button
          type="button"
          onClick={() => navigate('/app/households')}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Manage households
        </button>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Administration (admin only) */}
      {user?.isAdmin && (
        <>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Administration</h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/app/admin/users')}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Manage users
            </button>
          </div>

          <hr className="border-gray-200 dark:border-gray-700" />
        </>
      )}

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

      {/* Overdue notification preferences */}
      <form onSubmit={handleSaveNotificationPreferences} className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Overdue task notifications</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={overdueNotificationsEnabled}
            onChange={(e) => setOverdueNotificationsEnabled(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Notify me about overdue tasks</span>
        </label>

        <div className={overdueNotificationsEnabled ? '' : 'opacity-50 pointer-events-none'}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Send overdue notifications at</label>
          <select
            value={overdueNotificationHour}
            onChange={(e) => setOverdueNotificationHour(Number(e.target.value))}
            disabled={!overdueNotificationsEnabled}
            className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{formatHour(h)}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
          Save notification preferences
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

      {/* Sign out */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="px-4 py-2 text-sm border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* About */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-600">
          Postpone {import.meta.env.VITE_APP_VERSION ? `build ${import.meta.env.VITE_APP_VERSION}` : 'local dev'}
        </p>
        <a
          href="https://github.com/atlisd/Postpone"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
