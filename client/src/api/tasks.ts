import { api } from './client';
import type { TaskResponse, ReminderResponse } from '../types/api';

export async function listTasks(projectId: string, includeCompleted = false): Promise<TaskResponse[]> {
  return api.get(`api/projects/${projectId}/tasks`, {
    searchParams: { includeCompleted: String(includeCompleted) },
  }).json<TaskResponse[]>();
}

export async function getTask(id: string): Promise<TaskResponse> {
  return api.get(`api/tasks/${id}`).json<TaskResponse>();
}

export async function createTask(projectId: string, data: {
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  dueDateTime?: string;
  assignedToId?: string;
}): Promise<TaskResponse> {
  return api.post(`api/projects/${projectId}/tasks`, { json: data }).json<TaskResponse>();
}

export async function updateTask(id: string, data: {
  title?: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  clearDueDate?: boolean;
  dueDateTime?: string;
  clearDueDateTime?: boolean;
  assignedToId?: string;
  clearAssignedTo?: boolean;
}): Promise<TaskResponse> {
  return api.put(`api/tasks/${id}`, { json: data }).json<TaskResponse>();
}

export async function deleteTask(id: string): Promise<void> {
  await api.delete(`api/tasks/${id}`);
}

export async function completeTask(id: string): Promise<TaskResponse> {
  return api.post(`api/tasks/${id}/complete`).json<TaskResponse>();
}

export async function uncompleteTask(id: string): Promise<TaskResponse> {
  return api.post(`api/tasks/${id}/uncomplete`).json<TaskResponse>();
}

export async function moveTask(id: string, projectId: string): Promise<TaskResponse> {
  return api.put(`api/tasks/${id}/move`, { json: { projectId } }).json<TaskResponse>();
}

export async function updateTaskDueDate(id: string, dueDate: string | null): Promise<TaskResponse> {
  return api.put(`api/tasks/${id}/due-date`, { json: { dueDate } }).json<TaskResponse>();
}

export async function reorderTasks(projectId: string, orderedIds: string[]): Promise<void> {
  await api.post(`api/projects/${projectId}/tasks/reorder`, { json: { orderedIds } });
}

// Subtasks
export async function createSubtask(taskId: string, title: string): Promise<SubtaskResponse> {
  return api.post(`api/tasks/${taskId}/subtasks`, { json: { title } }).json<SubtaskResponse>();
}

export async function updateSubtask(id: string, data: { title?: string; isCompleted?: boolean }): Promise<SubtaskResponse> {
  return api.put(`api/subtasks/${id}`, { json: data }).json<SubtaskResponse>();
}

export async function deleteSubtask(id: string): Promise<void> {
  await api.delete(`api/subtasks/${id}`);
}

export async function reorderSubtasks(taskId: string, items: { id: string; sortOrder: number }[]): Promise<void> {
  await api.put(`api/tasks/${taskId}/subtasks/reorder`, { json: { items } });
}

// Tags on tasks
export async function addTagToTask(taskId: string, tagId: string): Promise<void> {
  await api.post(`api/tasks/${taskId}/tags`, { json: { tagId } });
}

export async function removeTagFromTask(taskId: string, tagId: string): Promise<void> {
  await api.delete(`api/tasks/${taskId}/tags/${tagId}`);
}

// Recurrence
export async function setRecurrence(taskId: string, rrule: string): Promise<TaskResponse> {
  return api.put(`api/tasks/${taskId}/recurrence`, { json: { rrule } }).json<TaskResponse>();
}

export async function removeRecurrence(taskId: string): Promise<TaskResponse> {
  return api.delete(`api/tasks/${taskId}/recurrence`).json<TaskResponse>();
}

// Occurrence-specific operations (for recurring tasks)
export async function completeOccurrence(taskId: string, date: string): Promise<void> {
  await api.post(`api/tasks/${taskId}/occurrences/${date}/complete`);
}

export async function uncompleteOccurrence(taskId: string, date: string): Promise<void> {
  await api.post(`api/tasks/${taskId}/occurrences/${date}/uncomplete`);
}

export async function skipOccurrence(taskId: string, date: string): Promise<void> {
  await api.delete(`api/tasks/${taskId}/occurrences/${date}`);
}

export async function editOccurrence(taskId: string, date: string, data: {
  title?: string;
  description?: string;
  priority?: number;
  assignedToId?: string;
  clearAssignedTo?: boolean;
}): Promise<void> {
  await api.put(`api/tasks/${taskId}/occurrences/${date}`, { json: data });
}

export async function rescheduleOccurrence(taskId: string, date: string, newDate: string): Promise<void> {
  await api.put(`api/tasks/${taskId}/occurrences/${date}/due-date`, { json: { newDate } });
}

export async function splitSeriesFrom(
  taskId: string,
  fromDate: string,
  newDate: string,
): Promise<{ updatedTask: TaskResponse; newTask: TaskResponse }> {
  return api.post(`api/tasks/${taskId}/occurrences/${fromDate}/split-from`, { json: { newDate } })
    .json<{ updatedTask: TaskResponse; newTask: TaskResponse }>();
}

// Smart lists
export async function getSmartList(name: 'today' | 'tomorrow' | 'next7days' | 'all' | 'assigned-to-me'): Promise<TaskResponse[]> {
  return api.get(`api/smart-lists/${name}`).json<TaskResponse[]>();
}

// Reminders
export async function addReminder(taskId: string, offsetMinutes: number): Promise<ReminderResponse> {
  return api.post(`api/tasks/${taskId}/reminders`, { json: { offsetMinutes } }).json<ReminderResponse>();
}

export async function deleteReminder(taskId: string, reminderId: string): Promise<void> {
  await api.delete(`api/tasks/${taskId}/reminders/${reminderId}`);
}

interface SubtaskResponse {
  id: string;
  title: string;
  isCompleted: boolean;
  sortOrder: number;
}
