import { api } from './client';
import type { ProjectResponse } from '../types/api';

export async function listProjects(): Promise<ProjectResponse[]> {
  return api.get('api/projects').json<ProjectResponse[]>();
}

export async function getProject(id: string): Promise<ProjectResponse> {
  return api.get(`api/projects/${id}`).json<ProjectResponse>();
}

export async function createProject(data: { name: string; color?: string; icon?: string; householdId?: string }): Promise<ProjectResponse> {
  return api.post('api/projects', { json: data }).json<ProjectResponse>();
}

export async function updateProject(id: string, data: { name?: string; color?: string; icon?: string; isArchived?: boolean }): Promise<ProjectResponse> {
  return api.put(`api/projects/${id}`, { json: data }).json<ProjectResponse>();
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`api/projects/${id}`);
}

export async function reorderProjects(orderedIds: string[]): Promise<void> {
  await api.post('api/projects/reorder', { json: { orderedIds } });
}

export interface ProjectMember {
  userId: string;
  displayName: string;
  email: string;
}

export async function getProjectMembers(id: string): Promise<ProjectMember[]> {
  return api.get(`api/projects/${id}/members`).json<ProjectMember[]>();
}

export async function shareProject(id: string, userId: string, permission = 'edit'): Promise<void> {
  await api.post(`api/projects/${id}/share`, { json: { userId, permission } });
}

export async function unshareProject(id: string, userId: string): Promise<void> {
  await api.delete(`api/projects/${id}/share/${userId}`);
}
