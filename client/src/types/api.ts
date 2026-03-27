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
  pushoverUserKey: string | null;
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
  recurrenceParentId: string | null;
  recurrenceOriginDate: string | null;
  subtasks: SubtaskResponse[];
  tags: TagResponse[];
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

export interface TagFull {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}
