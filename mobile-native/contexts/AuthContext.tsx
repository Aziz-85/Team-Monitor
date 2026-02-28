import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { hasStoredToken } from '@/lib/authStore';

type AuthContextValue = {
  hasToken: boolean | null;
  setHasToken: (value: boolean) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [hasToken, setHasTokenState] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasStoredToken().then((v) => {
      if (!cancelled) setHasTokenState(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setHasToken = useCallback((value: boolean) => {
    setHasTokenState(value);
  }, []);

  return (
    <AuthContext.Provider value={{ hasToken, setHasToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
