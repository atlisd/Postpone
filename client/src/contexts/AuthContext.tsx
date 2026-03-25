import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { setTokens, clearTokens, getStoredRefreshToken } from '../api/client';
import { login as apiLogin, getProfile, logout as apiLogout, refreshTokens } from '../api/auth';
import type { UserProfile } from '../types/api';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
    } catch {
      setUser(null);
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
        }
      }
      setIsLoading(false);
    };
    init();
  }, [refreshUser]);

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
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
