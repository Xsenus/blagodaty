import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  ApiError,
  getCurrentAccount,
  getRegistration,
  login as loginRequest,
  logout as logoutRequest,
  refreshSession as refreshSessionRequest,
  register as registerRequest,
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
  loadRegistration: () => Promise<CampRegistration | null>;
  saveRegistration: (payload: SaveRegistrationRequest) => Promise<CampRegistration>;
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

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [account, setAccount] = useState<CurrentAccount | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = readStoredSession();
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
          const refreshed = await refreshSessionRequest(stored);
          const nextSession = {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            accessTokenExpiresAtUtc: refreshed.accessTokenExpiresAtUtc,
            refreshTokenExpiresAtUtc: refreshed.refreshTokenExpiresAtUtc,
          };
          const currentAccount = await getCurrentAccount(nextSession.accessToken);
          setSession(nextSession);
          setAccount(currentAccount);
          writeStoredSession(nextSession);
        } catch {
          writeStoredSession(null);
          setSession(null);
          setAccount(null);
        }
      } else {
        writeStoredSession(null);
        setSession(null);
        setAccount(null);
      }
    } finally {
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
      externalIdentities: [],
      availableExternalAuthProviders: [],
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

    writeStoredSession(null);
    setSession(null);
    setAccount(null);
  }

  async function reloadAccount(accessTokenOverride?: string) {
    const token = accessTokenOverride ?? session?.accessToken;
    if (!token) {
      return;
    }

    const currentAccount = await getCurrentAccount(token);
    setAccount(currentAccount);
  }

  async function handleUpdateProfile(payload: UpdateProfileRequest) {
    if (!session) {
      throw new Error('Not authenticated');
    }

    const updatedUser = await updateProfile(session.accessToken, payload);
    setAccount((current) =>
      current
        ? {
            ...current,
            user: updatedUser,
          }
        : {
            user: updatedUser,
            registration: null,
            externalIdentities: [],
            availableExternalAuthProviders: [],
            hasPassword: true,
          },
    );
  }

  async function loadCurrentRegistration() {
    if (!session) {
      throw new Error('Not authenticated');
    }

    try {
      return await getRegistration(session.accessToken);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  async function handleSaveRegistration(payload: SaveRegistrationRequest) {
    if (!session) {
      throw new Error('Not authenticated');
    }

    const saved = await saveRegistration(session.accessToken, payload);
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
