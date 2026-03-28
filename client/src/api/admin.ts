import { api } from './client';
import type { AdminUser, AdminUserCreated } from '../types/api';

export async function listUsers(): Promise<AdminUser[]> {
  return api.get('api/admin/users').json<AdminUser[]>();
}

export async function createUser(data: { email: string; displayName: string }): Promise<AdminUserCreated> {
  return api.post('api/admin/users', { json: data }).json<AdminUserCreated>();
}

export async function updateUser(id: string, data: { displayName?: string; isAdmin?: boolean }): Promise<AdminUser> {
  return api.put(`api/admin/users/${id}`, { json: data }).json<AdminUser>();
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(`api/admin/users/${id}`);
}

export async function regenerateInvitation(id: string): Promise<{ token: string }> {
  return api.post(`api/admin/users/${id}/invitation`).json<{ token: string }>();
}

export async function generatePasswordResetLink(id: string): Promise<{ token: string }> {
  return api.post(`api/admin/users/${id}/password-reset-link`).json<{ token: string }>();
}
