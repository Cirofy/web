"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { TeamRole } from "@/lib/types/team";
import {
  API_URL,
  clearSession,
  getStoredUser,
  getToken,
  setSession,
  type AuthUser,
} from "@/lib/api";

export type SessionUser = AuthUser & {
  teamRole?: TeamRole;
  plan?: string;
  organization?: { id: string; name?: string; slug?: string } | null;
};

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/** Module cache — layout yeniden mount olsa bile sidebar skeleton'a düşmez. */
let bootstrapped = false;
let cachedUser: SessionUser | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(cachedUser);
  const [ready, setReady] = useState(bootstrapped);

  useEffect(() => {
    if (bootstrapped) {
      setUser(cachedUser);
      setReady(true);
      return;
    }

    let cancelled = false;

    void (async () => {
      const token = getToken();
      if (token) {
        const stored = getStoredUser() as SessionUser | null;
        if (stored) {
          setUser(stored);
          cachedUser = stored;
        }
        try {
          const res = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const me = (await res.json()) as SessionUser;
            if (!cancelled && me?.id) {
              setSession(token, me);
              setUser(me);
              cachedUser = me;
            }
          } else if (res.status === 401) {
            clearSession();
            cachedUser = null;
            bootstrapped = true;
            if (!cancelled) {
              setReady(true);
              router.replace("/login");
            }
            return;
          }
        } catch {
          // token var, /me yoksa stored ile devam
        }
        bootstrapped = true;
        if (!cancelled) setReady(true);
        return;
      }

      bootstrapped = true;
      cachedUser = null;
      if (!cancelled) {
        setReady(true);
        router.replace("/login");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = useCallback(() => {
    clearSession();
    bootstrapped = false;
    cachedUser = null;
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, ready, logout }),
    [user, ready, logout],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useRequireAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useRequireAuth AuthProvider içinde kullanılmalı");
  }
  return ctx;
}
