import { api } from './client';

export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
}

export async function listUsers(): Promise<UserSummary[]> {
  return api.get('api/users').json<UserSummary[]>();
}
