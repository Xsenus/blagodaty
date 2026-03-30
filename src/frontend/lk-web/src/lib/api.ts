import { apiBaseUrl } from './config';
import type {
  AdminExternalAuthProvider,
  AdminExternalAuthSettings,
  AdminEventDetails,
  AdminEventsResponse,
  AdminOverview,
  AdminUser,
  AccountRegistrationSummary,
  AuthResponse,
  CampRegistration,
  CurrentAccount,
  ExternalAuthStartResponse,
  ExternalAuthStatusResponse,
  PaginatedResponse,
  PublicEventDetails,
  PublicEventSummary,
  PublicExternalAuthProvider,
  SaveRegistrationRequest,
  SessionState,
  UpsertAdminEventRequest,
  UpdateProfileRequest,
  UpdateExternalAuthProviderRequest,
  UserSummary,
} from '../types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const errorBody = (await response.json()) as { message?: string; title?: string };
      message = errorBody.message ?? errorBody.title ?? message;
    } catch {
      // ignore malformed error body
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function register(payload: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName?: string;
}) {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function login(payload: { email: string; password: string }) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function refreshSession(session: SessionState) {
  return request<AuthResponse>('/api/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  });
}

export function logout(refreshToken: string) {
  return request<void>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function getCurrentAccount(accessToken: string) {
  return request<CurrentAccount>('/api/account/me', {}, accessToken);
}

export function getPublicExternalAuthProviders() {
  return request<{ providers: PublicExternalAuthProvider[] }>('/api/public/auth/providers');
}

export function updateProfile(accessToken: string, payload: UpdateProfileRequest) {
  return request<UserSummary>(
    '/api/account/profile',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function unlinkExternalIdentity(accessToken: string, provider: string) {
  return request<CurrentAccount['externalIdentities']>(
    `/api/account/external/${provider}`,
    {
      method: 'DELETE',
    },
    accessToken,
  );
}

export function startExternalAuth(
  payload: { provider: string; intent?: 'signin' | 'link'; returnUrl?: string },
  accessToken?: string,
) {
  return request<ExternalAuthStartResponse>(
    '/api/auth/external/start',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function getExternalAuthStatus(state: string) {
  return request<ExternalAuthStatusResponse>(`/api/auth/external/status/${state}`);
}

export function startTelegramAuth(
  payload: { intent?: 'signin' | 'link'; returnUrl?: string },
  accessToken?: string,
) {
  return request<ExternalAuthStartResponse>(
    '/api/auth/telegram/start',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function getTelegramAuthStatus(state: string) {
  return request<ExternalAuthStatusResponse>(`/api/auth/telegram/status/${state}`);
}

export function loginWithTelegramWidget(payload: {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string;
  hash: string;
}) {
  return request<AuthResponse>('/api/auth/telegram/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getRegistration(accessToken: string) {
  return request<CampRegistration>('/api/camp/registration', {}, accessToken);
}

export function saveRegistration(accessToken: string, payload: SaveRegistrationRequest) {
  return request<CampRegistration>(
    '/api/camp/registration',
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function getAccountRegistrations(accessToken: string) {
  return request<AccountRegistrationSummary[]>('/api/account/registrations', {}, accessToken);
}

export function getPublicEvents() {
  return request<{ events: PublicEventSummary[] }>('/api/events');
}

export function getPublicEvent(slug: string) {
  return request<PublicEventDetails>(`/api/events/${slug}`);
}

export function getEventRegistration(accessToken: string, slug: string) {
  return request<CampRegistration>(`/api/events/${slug}/registration`, {}, accessToken);
}

export function saveEventRegistration(accessToken: string, slug: string, payload: SaveRegistrationRequest) {
  return request<CampRegistration>(
    `/api/events/${slug}/registration`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function getAdminOverview(accessToken: string) {
  return request<AdminOverview>('/api/admin/overview', {}, accessToken);
}

export function getAdminUsers(
  accessToken: string,
  params: {
    page: number;
    pageSize: number;
    search?: string;
    role?: string;
  },
) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });

  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }

  if (params.role && params.role !== 'all') {
    query.set('role', params.role);
  }

  return request<PaginatedResponse<AdminUser>>(`/api/admin/users?${query.toString()}`, {}, accessToken);
}

export function getAdminRegistrations(
  accessToken: string,
  params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    eventEditionId?: string;
  },
) {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });

  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }

  if (params.status && params.status !== 'all') {
    query.set('status', params.status);
  }

  if (params.eventEditionId && params.eventEditionId !== 'all') {
    query.set('eventEditionId', params.eventEditionId);
  }

  return request<PaginatedResponse<AdminUser>>(`/api/admin/registrations?${query.toString()}`, {}, accessToken);
}

export function updateUserRoles(accessToken: string, userId: string, roles: string[]) {
  return request<AdminUser>(
    `/api/admin/users/${userId}/roles`,
    {
      method: 'PUT',
      body: JSON.stringify({ roles }),
    },
    accessToken,
  );
}

export function getAdminExternalAuthSettings(accessToken: string) {
  return request<AdminExternalAuthSettings>('/api/admin/auth/settings', {}, accessToken);
}

export function getAdminEvents(accessToken: string) {
  return request<AdminEventsResponse>('/api/admin/events', {}, accessToken);
}

export function getAdminEventDetails(accessToken: string, eventId: string) {
  return request<AdminEventDetails>(`/api/admin/events/${eventId}`, {}, accessToken);
}

export function createAdminEvent(accessToken: string, payload: UpsertAdminEventRequest) {
  return request<AdminEventDetails>(
    '/api/admin/events',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function updateAdminEvent(accessToken: string, eventId: string, payload: UpsertAdminEventRequest) {
  return request<AdminEventDetails>(
    `/api/admin/events/${eventId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function updateAdminExternalAuthProvider(
  accessToken: string,
  provider: string,
  payload: UpdateExternalAuthProviderRequest,
) {
  return request<AdminExternalAuthProvider>(
    `/api/admin/auth/providers/${provider}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function startAdminExternalAuthProviderTest(accessToken: string, provider: string) {
  return request<ExternalAuthStartResponse>(
    `/api/admin/auth/providers/${provider}/test/start`,
    {
      method: 'POST',
    },
    accessToken,
  );
}
