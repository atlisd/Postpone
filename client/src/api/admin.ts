import { api } from './client';
import type { AdminUser } from '../types/api';

export async function listUsers(): Promise<AdminUser[]> {
  return api.get('api/admin/users').json<AdminUser[]>();
}

export async function createUser(data: { email: string; displayName: string; password: string }): Promise<AdminUser> {
  return api.post('api/admin/users', { json: data }).json<AdminUser>();
}

export async function updateUser(id: string, data: { displayName?: string; password?: string; isAdmin?: boolean }): Promise<AdminUser> {
  return api.put(`api/admin/users/${id}`, { json: data }).json<AdminUser>();
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`api/admin/users/${id}`);
}
