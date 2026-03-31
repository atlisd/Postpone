import { api } from './client';
import type { AuthResponse, UserProfile } from '../types/api';

export async function getSetupStatus(): Promise<{ needsSetup: boolean }> {
  return api.get('api/auth/setup-status').json();
}

export async function setup(email: string, password: string, displayName: string): Promise<void> {
  await api.post('api/auth/setup', { json: { email, password, displayName } });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return api.post('api/auth/login', { json: { email, password } }).json<AuthResponse>();
}

export async function refreshTokens(): Promise<AuthResponse> {
  return api.post('api/auth/refresh').json<AuthResponse>();
}

export async function logout(): Promise<void> {
  await api.post('api/auth/logout');
}

export async function getProfile(): Promise<UserProfile> {
  return api.get('api/auth/me').json<UserProfile>();
}

export async function updateProfile(data: { displayName?: string; timezone?: string; locale?: string; useGravatar?: boolean }): Promise<UserProfile> {
  return api.put('api/auth/me', { json: data }).json<UserProfile>();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.put('api/auth/me/password', { json: { currentPassword, newPassword } });
}

export async function setPushoverKey(userKey: string | null): Promise<void> {
  await api.put('api/auth/me/pushover', { json: { userKey } });
}

export async function setNotificationPreferences(data: {
  overdueNotificationsEnabled?: boolean;
  overdueNotificationHour?: number;
}): Promise<void> {
  await api.put('api/auth/me/notification-preferences', { json: data });
}

export async function validateToken(
  token: string,
  type: 'invitation' | 'password-reset'
): Promise<{ isValid: boolean; email?: string; displayName?: string }> {
  return api.get(`api/auth/validate-token?token=${encodeURIComponent(token)}&type=${type}`).json();
}

export async function acceptInvitation(token: string, newPassword: string): Promise<void> {
  await api.post('api/auth/accept-invitation', { json: { token, newPassword } });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post('api/auth/reset-password', { json: { token, newPassword } });
}
