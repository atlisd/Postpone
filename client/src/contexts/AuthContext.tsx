import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { setTokens, clearTokens, getStoredRefreshToken } from '../api/client';
import { login as apiLogin, getProfile, logout as apiLogout, refreshTokens, getSetupStatus } from '../api/auth';
import type { UserProfile } from '../types/api';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  needsSetup: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  recheckSetup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
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
    const init = async () => {
      const rt = getStoredRefreshToken();
      if (rt) {
        try {
          const tokens = await refreshTokens(rt);
          setTokens(tokens.accessToken, tokens.refreshToken);
          await refreshUser();
        } catch {
          clearTokens();
          await recheckSetup();
        }
      } else {
        await recheckSetup();
      }
      setIsLoading(false);
    };
    init();
  }, [refreshUser, recheckSetup]);

  const login = async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    setTokens(response.accessToken, response.refreshToken);
    await refreshUser();
    return { mustChangePassword: response.mustChangePassword };
  };

  const logout = async () => {
    const rt = getStoredRefreshToken();
    if (rt) {
      try { await apiLogout(rt); } catch { /* ignore */ }
    }
    clearTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, needsSetup, login, logout, refreshUser, recheckSetup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
