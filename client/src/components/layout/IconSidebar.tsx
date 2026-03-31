import { useNavigate, useLocation } from 'react-router';
import { CalendarDays, SquareCheck, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const taskRoutes = ['/app/today', '/app/tomorrow', '/app/next7days', '/app/all', '/app/assigned', '/app/projects/'];

export function IconSidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isTasksActive = taskRoutes.some(r => location.pathname.startsWith(r));
  const isCalendarActive = location.pathname === '/app/calendar';
  const isSettingsActive = location.pathname === '/app/settings';

  const btnClass = (active: boolean) =>
    `flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
      active
        ? 'bg-blue-100 dark:bg-gray-700 text-blue-700 dark:text-gray-100'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-800'
    }`;

  return (
    <aside className="hidden md:flex flex-col items-center w-14 py-3 gap-2 bg-gray-200 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-shrink-0">
      {/* User avatar */}
      <button
        onClick={() => navigate('/app/settings')}
        className={`${btnClass(isSettingsActive)} mb-2`}
        title="Settings"
      >
        {user?.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.displayName} className="w-7 h-7 rounded-full object-cover" />
        ) : user?.displayName ? (
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
            isSettingsActive
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}>
            {user.displayName[0].toUpperCase()}
          </span>
        ) : (
          <User size={18} />
        )}
      </button>

      {/* Tasks */}
      <button
        onClick={() => navigate('/app/today')}
        className={btnClass(isTasksActive)}
        title="Tasks"
      >
        <SquareCheck size={20} />
      </button>

      {/* Calendar */}
      <button
        onClick={() => navigate('/app/calendar')}
        className={btnClass(isCalendarActive)}
        title="Calendar"
      >
        <CalendarDays size={20} />
      </button>
    </aside>
  );
}
