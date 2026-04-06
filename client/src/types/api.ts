export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  mustChangePassword: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  timezone: string;
  locale: string;
  pushoverUserKey: string | null;
  overdueNotificationsEnabled: boolean;
  overdueNotificationHour: number;
  useGravatar: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  hasPassword: boolean;
}

export interface AdminUserCreated extends AdminUser {
  invitationToken: string;
}

export interface ProjectResponse {
  id: string;
  ownerId: string;
  ownerName: string;
  householdId: string | null;
  name: string;
  color: string;
  icon: string | null;
  isArchived: boolean;
  taskCount: number;
  completedTaskCount: number;
  createdAt: string;
  isInbox: boolean;
}

export interface TaskResponse {
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  createdById: string;
  createdByName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  title: string;
  description: string;
  priority: number;
  dueDate: string | null;
  dueDateTime: string | null;
  completedAt: string | null;
  rrule: string | null;
  occurrenceDate: string | null;
  isRecurrenceException: boolean;
  subtasks: SubtaskResponse[];
  tags: TagResponse[];
  reminders: ReminderResponse[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubtaskResponse {
  id: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
}

export interface TagResponse {
  id: string;
  name: string;
  color: string;
}

export interface ReminderResponse {
  id: string;
  offsetMinutes: number;
}

export interface TagFull {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  taskCount: number;
}
