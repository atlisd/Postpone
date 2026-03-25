import { api } from './client';
import type { TagFull } from '../types/api';

export async function listTags(): Promise<TagFull[]> {
  return api.get('api/tags').json<TagFull[]>();
}

export async function createTag(data: { name: string; color?: string }): Promise<TagFull> {
  return api.post('api/tags', { json: data }).json<TagFull>();
}

export async function updateTag(id: string, data: { name?: string; color?: string }): Promise<TagFull> {
  return api.put(`api/tags/${id}`, { json: data }).json<TagFull>();
}

export async function deleteTag(id: string): Promise<void> {
  await api.delete(`api/tags/${id}`);
}
