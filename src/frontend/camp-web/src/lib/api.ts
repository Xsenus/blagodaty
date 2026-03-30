import { apiBaseUrl } from './config';
import type { PublicEventDetails, PublicEventSummary } from '../types';

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getPublicEvents() {
  return request<{ events: PublicEventSummary[] }>('/api/events');
}

export function getPublicEvent(slug: string) {
  return request<PublicEventDetails>(`/api/events/${slug}`);
}
