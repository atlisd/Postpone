import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/auth/AuthGuard';
import { LoginPage } from './components/auth/LoginPage';
import { SetupPage } from './components/auth/SetupPage';
import { ChangePasswordPage } from './components/auth/ChangePasswordPage';
import { AcceptInvitationPage } from './components/auth/AcceptInvitationPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { AppShell } from './components/layout/AppShell';
import { AdminUsersPage } from './components/auth/AdminUsersPage';
import { ProjectTaskList } from './components/projects/ProjectTaskList';
import { SmartListView } from './components/smart-lists/SmartListView';
import { CalendarView } from './components/calendar/CalendarView';
import { SettingsPage } from './components/settings/SettingsPage';
import { HouseholdListPage } from './components/households/HouseholdListPage';
import { HouseholdPage } from './components/households/HouseholdPage';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<AuthGuard />}>
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Navigate to="today" replace />} />
              <Route path="today" element={<ErrorBoundary><SmartListView type="today" title="Today" /></ErrorBoundary>} />
              <Route path="tomorrow" element={<ErrorBoundary><SmartListView type="tomorrow" title="Tomorrow" /></ErrorBoundary>} />
              <Route path="next7days" element={<ErrorBoundary><SmartListView type="next7days" title="Next 7 Days" /></ErrorBoundary>} />
              <Route path="all" element={<ErrorBoundary><SmartListView type="all" title="All Tasks" /></ErrorBoundary>} />
              <Route path="assigned" element={<ErrorBoundary><SmartListView type="assigned-to-me" title="Assigned to Me" /></ErrorBoundary>} />
              <Route path="projects/:id" element={<ErrorBoundary><ProjectTaskList /></ErrorBoundary>} />
              <Route path="calendar" element={<ErrorBoundary><CalendarView /></ErrorBoundary>} />
              <Route path="households" element={<ErrorBoundary><HouseholdListPage /></ErrorBoundary>} />
              <Route path="household/:id" element={<ErrorBoundary><HouseholdPage /></ErrorBoundary>} />
              <Route path="settings" element={<ErrorBoundary><SettingsPage /></ErrorBoundary>} />
              <Route path="admin/users" element={<ErrorBoundary><AdminUsersPage /></ErrorBoundary>} />
            </Route>
          </Route>

          <Route index element={<Navigate to="/app" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}
