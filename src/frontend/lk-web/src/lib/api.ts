import { apiBaseUrl } from './config';
import type {
  AdminOverview,
  AdminUser,
  AuthResponse,
  CampRegistration,
  CurrentAccount,
  SaveRegistrationRequest,
  SessionState,
  UpdateProfileRequest,
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

export function getAdminOverview(accessToken: string) {
  return request<AdminOverview>('/api/admin/overview', {}, accessToken);
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
