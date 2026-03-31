import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { HTTPError } from 'ky';
import { setTokens, clearTokens, getAccessToken } from '../api/client';
import { login as apiLogin, getProfile, logout as apiLogout, refreshTokens, getSetupStatus } from '../api/auth';
import { getGravatarUrl } from '../lib/gravatar';
import type { UserProfile } from '../types/api';

interface AuthContextType {
  user: UserProfile | null;
  gravatarUrl: string | null;
  isLoading: boolean;
  needsSetup: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  recheckSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000 + 10;
  } catch {
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
    } catch {
      setUser(null);
    }
  }, []);

  const recheckSetup = useCallback(async () => {
    try {
      const status = await getSetupStatus();
      setNeedsSetup(status.needsSetup);
    } catch {
      setNeedsSetup(false);
    }
  }, []);

  useEffect(() => {
    if (user?.email && user.useGravatar) {
      getGravatarUrl(user.email).then(setGravatarUrl);
    } else {
      setGravatarUrl(null);
    }
  }, [user?.email, user?.useGravatar]);

  useEffect(() => {
    const init = async () => {
      // Try stored access token first (works across tabs via localStorage)
      const storedToken = getAccessToken();
      if (storedToken && !isJwtExpired(storedToken)) {
        try {
          await refreshUser();
          setIsLoading(false);
          return;
        } catch {
          // Token might be expired — fall through to cookie refresh
        }
      }

      // Fall back to cookie-based refresh
      try {
        const tokens = await refreshTokens();
        setTokens(tokens.accessToken);
        await refreshUser();
      } catch (err) {
        if (err instanceof HTTPError && err.response.status !== 401) {
          // Non-auth error (network down, server error) — don't treat as logged out
        } else {
          clearTokens();
        }
        await recheckSetup();
      }
      setIsLoading(false);
    };
    init();
  }, [refreshUser, recheckSetup]);

  const login = async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    setTokens(response.accessToken);
    await refreshUser();
    return { mustChangePassword: response.mustChangePassword };
  };

  const logout = async () => {
    try { await apiLogout(); } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, gravatarUrl, isLoading, needsSetup, login, logout, refreshUser, recheckSetup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
