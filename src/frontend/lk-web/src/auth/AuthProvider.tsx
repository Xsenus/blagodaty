import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ApiError,
  getEventRegistration,
  getCurrentAccount,
  getRegistration,
  login as loginRequest,
  logout as logoutRequest,
  redeemSessionTransfer,
  refreshSession as refreshSessionRequest,
  register as registerRequest,
  saveEventRegistration,
  saveRegistration,
  updateProfile,
} from '../lib/api';
import type {
  AuthResponse,
  CampRegistration,
  CurrentAccount,
  SaveRegistrationRequest,
  SessionState,
  UpdateProfileRequest,
} from '../types';

type AuthContextValue = {
  session: SessionState | null;
  account: CurrentAccount | null;
  isReady: boolean;
  isAuthenticated: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    displayName?: string;
  }) => Promise<void>;
  acceptAuthResponse: (payload: AuthResponse) => Promise<void>;
  logout: () => Promise<void>;
  reloadAccount: () => Promise<void>;
  updateProfile: (payload: UpdateProfileRequest) => Promise<void>;
  withSession: <T>(operation: (accessToken: string) => Promise<T>) => Promise<T>;
  loadRegistration: (eventSlug?: string | null) => Promise<CampRegistration | null>;
  saveRegistration: (payload: SaveRegistrationRequest, eventSlug?: string | null) => Promise<CampRegistration>;
};

const STORAGE_KEY = 'blagodaty.lk.session';
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredSession(): SessionState | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeStoredSession(session: SessionState | null) {
  if (!session) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function readSessionTransferToken() {
  if (typeof window === 'undefined') {
    return null;
  }

  const currentUrl = new URL(window.location.href);
  const value = currentUrl.searchParams.get('transfer');
  return value?.trim() ? value.trim() : null;
}

function clearSessionTransferTokenFromUrl() {
  if (typeof window === 'undefined') {
    return;
  }

  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has('transfer')) {
    return;
  }

  currentUrl.searchParams.delete('transfer');
  window.history.replaceState({}, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [isReady, setIsReady] = useState(false);
  const refreshPromiseRef = useRef<Promise<SessionState> | null>(null);

  useEffect(() => {
    const transferToken = readSessionTransferToken();
    const stored = readStoredSession();

    if (transferToken) {
      void bootstrapTransfer(transferToken, stored);
      return;
    }

    if (!stored) {
      setIsReady(true);
      return;
    }

    void bootstrap(stored);
  }, []);

  async function bootstrap(stored: SessionState) {
    try {
      const currentAccount = await getCurrentAccount(stored.accessToken);
      setSession(stored);
      setAccount(currentAccount);
      writeStoredSession(stored);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          const nextSession = await refreshActiveSession(stored);
          const currentAccount = await getCurrentAccount(nextSession.accessToken);
          setSession(nextSession);
          setAccount(currentAccount);
          writeStoredSession(nextSession);
        } catch {
          clearAuthState();
        }
      } else {
        clearAuthState();
      }
    } finally {
      setIsReady(true);
    }
  }

  async function bootstrapTransfer(token: string, fallbackSession: SessionState | null) {
    try {
      const response = await redeemSessionTransfer(token);
      clearSessionTransferTokenFromUrl();
      await acceptAuthResponse(response);
      setIsReady(true);
    } catch {
      clearSessionTransferTokenFromUrl();

      if (fallbackSession) {
        await bootstrap(fallbackSession);
        return;
      }

      clearAuthState();
      setIsReady(true);
    }
  }

  function applySession(payload: {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAtUtc: string;
    refreshTokenExpiresAtUtc: string;
  }) {
    const nextSession = {
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      accessTokenExpiresAtUtc: payload.accessTokenExpiresAtUtc,
      refreshTokenExpiresAtUtc: payload.refreshTokenExpiresAtUtc,
    };

    setSession(nextSession);
    writeStoredSession(nextSession);
    return nextSession;
  }

  function clearAuthState() {
    writeStoredSession(null);
    setSession(null);
    setAccount(null);
  }

  async function refreshActiveSession(currentSession: SessionState) {
    if (!refreshPromiseRef.current) {
      refreshPromiseRef.current = (async () => {
        const refreshed = await refreshSessionRequest(currentSession);
        return applySession({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          accessTokenExpiresAtUtc: refreshed.accessTokenExpiresAtUtc,
          refreshTokenExpiresAtUtc: refreshed.refreshTokenExpiresAtUtc,
        });
      })().finally(() => {
        refreshPromiseRef.current = null;
      });
    }

    return await refreshPromiseRef.current;
  }

  async function withSessionRetry<T>(operation: (accessToken: string) => Promise<T>) {
    if (!session) {
      throw new Error('Not authenticated');
    }

    try {
      return await operation(session.accessToken);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }

      try {
        const refreshedSession = await refreshActiveSession(session);
        return await operation(refreshedSession.accessToken);
      } catch (refreshError) {
        if (refreshError instanceof ApiError) {
          clearAuthState();
          throw new Error('Сессия истекла. Войдите снова, чтобы продолжить работу.');
        }

        throw refreshError;
      }
    }
  }

  async function handleLogin(payload: { email: string; password: string }) {
    const response = await loginRequest(payload);
    await acceptAuthResponse(response);
  }

  async function handleRegister(payload: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    displayName?: string;
  }) {
    const response = await registerRequest(payload);
    await acceptAuthResponse(response);
  }

  async function acceptAuthResponse(payload: AuthResponse) {
    applySession(payload);
    setAccount({
      user: payload.user,
      registration: null,
      registrations: [],
      externalIdentities: [],
      availableExternalAuthProviders: [],
      unreadNotificationsCount: 0,
      hasPassword: true,
    });
    await reloadAccount(payload.accessToken);
  }

  async function handleLogout() {
    if (session?.refreshToken) {
      try {
        await logoutRequest(session.refreshToken);
      } catch {
        // ignore logout transport failures
      }
    }

    clearAuthState();
  }

  async function reloadAccount(accessTokenOverride?: string) {
    if (accessTokenOverride) {
      const currentAccount = await getCurrentAccount(accessTokenOverride);
      setAccount(currentAccount);
      return;
    }

    const currentAccount = await withSessionRetry((accessToken) => getCurrentAccount(accessToken));
    setAccount(currentAccount);
  }

  async function handleUpdateProfile(payload: UpdateProfileRequest) {
    const updatedUser = await withSessionRetry((accessToken) => updateProfile(accessToken, payload));
    setAccount((current) =>
      current
        ? {
            ...current,
            user: updatedUser,
          }
        : {
            user: updatedUser,
            registration: null,
            registrations: [],
            externalIdentities: [],
            availableExternalAuthProviders: [],
            unreadNotificationsCount: 0,
            hasPassword: true,
          },
    );
  }

  async function loadCurrentRegistration(eventSlug?: string | null) {
    try {
      return await withSessionRetry((accessToken) =>
        eventSlug
          ? getEventRegistration(accessToken, eventSlug)
          : getRegistration(accessToken),
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async function handleSaveRegistration(payload: SaveRegistrationRequest, eventSlug?: string | null) {
    const saved = await withSessionRetry((accessToken) =>
      eventSlug
        ? saveEventRegistration(accessToken, eventSlug, payload)
        : saveRegistration(accessToken, payload),
    );
    await reloadAccount();
    return saved;
  }

  const value: AuthContextValue = {
    session,
    account,
    isReady,
    isAuthenticated: Boolean(session?.accessToken),
    login: handleLogin,
    register: handleRegister,
    acceptAuthResponse,
    logout: handleLogout,
    reloadAccount: () => reloadAccount(),
    updateProfile: handleUpdateProfile,
    withSession: withSessionRetry,
    loadRegistration: loadCurrentRegistration,
    saveRegistration: handleSaveRegistration,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
