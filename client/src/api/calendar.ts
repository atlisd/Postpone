import { api } from './client';
import type { TaskResponse } from '../types/api';

export async function getCalendarTasks(start: string, end: string): Promise<TaskResponse[]> {
  return api.get('api/calendar', {
    searchParams: { start, end },
  }).json<TaskResponse[]>();
}
