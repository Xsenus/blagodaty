import { apiBaseUrl } from './config';
import type {
  AuthResponse,
  CampRegistration,
  CurrentAccount,
  PublicEventDetails,
  PublicEventSummary,
  PublicSiteSettings,
  SaveRegistrationRequest,
  SendPhoneVerificationCodeResponse,
  SessionTransferTicketResponse,
  SessionState,
  VerifyPhoneVerificationCodeResponse,
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

  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
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

export function sendPhoneVerificationCode(accessToken: string, payload: { phoneNumber: string }) {
  return request<SendPhoneVerificationCodeResponse>(
    '/api/account/phone/send-code',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function verifyPhoneVerificationCode(accessToken: string, payload: { phoneNumber: string; code: string }) {
  return request<VerifyPhoneVerificationCodeResponse>(
    '/api/account/phone/verify',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    accessToken,
  );
}

export function createSessionTransferTicket(accessToken: string) {
  return request<SessionTransferTicketResponse>(
    '/api/account/session-transfer',
    {
      method: 'POST',
    },
    accessToken,
  );
}

export function getPublicEvents() {
  return request<{ events: PublicEventSummary[] }>('/api/events');
}

export function getPublicEvent(slug: string) {
  return request<PublicEventDetails>(`/api/events/${slug}`);
}

export function getPublicSiteSettings() {
  return request<PublicSiteSettings>('/api/public/site-settings');
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

export function submitGuestEventRegistration(slug: string, payload: SaveRegistrationRequest) {
  return request<CampRegistration>(`/api/events/${slug}/registration`, {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      submit: true,
    }),
  });
}
