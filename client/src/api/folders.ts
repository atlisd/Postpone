import { api } from './client';
import type { ProjectFolderResponse } from '../types/api';

export async function listFolders(): Promise<ProjectFolderResponse[]> {
  return api.get('api/project-folders').json<ProjectFolderResponse[]>();
}

export async function createFolder(name: string, projectIds: string[]): Promise<ProjectFolderResponse> {
  return api.post('api/project-folders', { json: { name, projectIds } }).json<ProjectFolderResponse>();
}

export async function updateFolder(id: string, name: string): Promise<void> {
  await api.put(`api/project-folders/${id}`, { json: { name } });
}

export async function deleteFolder(id: string): Promise<void> {
  await api.delete(`api/project-folders/${id}`);
}

export async function addProjectToFolder(folderId: string, projectId: string): Promise<void> {
  await api.post(`api/project-folders/${folderId}/add`, { json: { projectId } });
}

export async function removeProjectFromFolder(folderId: string, projectId: string): Promise<void> {
  await api.post(`api/project-folders/${folderId}/remove`, { json: { projectId } });
}

export async function reorderFolderProjects(folderId: string, orderedIds: string[]): Promise<void> {
  await api.post(`api/project-folders/${folderId}/reorder`, { json: { orderedIds } });
}

export async function reorderTopLevel(items: { type: 'folder' | 'project'; id: string }[]): Promise<void> {
  await api.post('api/project-folders/reorder-toplevel', { json: { items } });
}

export async function setFolderCollapsed(folderId: string, isCollapsed: boolean): Promise<void> {
  await api.patch(`api/project-folders/${folderId}/collapse`, { json: { isCollapsed } });
}
