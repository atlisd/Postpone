import { api } from './client';
import type { AuthResponse, UserProfile } from '../types/api';

export async function login(email: string, password: string): Promise<AuthResponse> {
  return api.post('api/auth/login', { json: { email, password } }).json<AuthResponse>();
}

export async function refreshTokens(refreshToken: string): Promise<AuthResponse> {
  return api.post('api/auth/refresh', { json: { refreshToken } }).json<AuthResponse>();
}

export async function logout(refreshToken: string): Promise<void> {
  await api.post('api/auth/logout', { json: { refreshToken } });
}

export async function getProfile(): Promise<UserProfile> {
  return api.get('api/auth/me').json<UserProfile>();
}

export async function updateProfile(data: { displayName?: string; timezone?: string }): Promise<UserProfile> {
  return api.put('api/auth/me', { json: data }).json<UserProfile>();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.put('api/auth/me/password', { json: { currentPassword, newPassword } });
}

export async function setPushoverKey(userKey: string | null): Promise<void> {
  await api.put('api/auth/me/pushover', { json: { userKey } });
}
