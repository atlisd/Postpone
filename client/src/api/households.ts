import { api } from './client';

export interface HouseholdSummary {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

export interface HouseholdMember {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  joinedAt: string;
}

export interface HouseholdResponse {
  id: string;
  name: string;
  createdById: string;
  createdByName: string;
  inviteCode: string;
  members: HouseholdMember[];
  createdAt: string;
}

export async function listHouseholds(): Promise<HouseholdSummary[]> {
  return api.get('api/households').json<HouseholdSummary[]>();
}

export async function getHousehold(id: string): Promise<HouseholdResponse> {
  return api.get(`api/households/${id}`).json<HouseholdResponse>();
}

export async function createHousehold(name: string): Promise<HouseholdResponse> {
  return api.post('api/households', { json: { name } }).json<HouseholdResponse>();
}

export async function updateHousehold(id: string, name: string): Promise<HouseholdResponse> {
  return api.put(`api/households/${id}`, { json: { name } }).json<HouseholdResponse>();
}

export async function deleteHousehold(id: string): Promise<void> {
  await api.delete(`api/households/${id}`);
}

export async function regenerateInviteCode(id: string): Promise<{ inviteCode: string }> {
  return api.post(`api/households/${id}/regenerate-invite`).json<{ inviteCode: string }>();
}

export async function joinHousehold(inviteCode: string): Promise<HouseholdResponse> {
  return api.post('api/households/join', { json: { inviteCode } }).json<HouseholdResponse>();
}

export async function removeMember(householdId: string, userId: string): Promise<void> {
  await api.delete(`api/households/${householdId}/members/${userId}`);
}

export async function getMembers(householdId: string): Promise<HouseholdMember[]> {
  return api.get(`api/households/${householdId}/members`).json<HouseholdMember[]>();
}
