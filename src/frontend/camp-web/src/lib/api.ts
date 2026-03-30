import { apiBaseUrl } from './config';
import type { CampOverview } from '../types';

export async function getCampOverview(): Promise<CampOverview> {
  const response = await fetch(`${apiBaseUrl}/api/camp/overview`);

  if (!response.ok) {
    throw new Error('Failed to load camp overview');
  }

  return (await response.json()) as CampOverview;
}
