const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role?: string;
  teamRole?: "owner" | "ops" | "finance" | "agency";
  organization?: { id: string; name?: string; slug?: string } | null;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cirofy_token");
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cirofy_refresh");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("cirofy_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSession(
  accessToken: string,
  user: AuthUser,
  refreshToken?: string | null,
) {
  localStorage.setItem("cirofy_token", accessToken);
  localStorage.setItem("cirofy_user", JSON.stringify(user));
  if (refreshToken) {
    localStorage.setItem("cirofy_refresh", refreshToken);
  }
}

export function clearSession() {
  localStorage.removeItem("cirofy_token");
  localStorage.removeItem("cirofy_user");
  localStorage.removeItem("cirofy_refresh");
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
        user?: AuthUser;
      };
      if (!data.accessToken || !data.user) {
        clearSession();
        return false;
      }
      setSession(data.accessToken, data.user, data.refreshToken);
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const doFetch = async () => {
    const token = getToken();
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  };

  let res = await doFetch();
  if (res.status === 401 && getRefreshToken()) {
    const ok = await tryRefreshSession();
    if (ok) res = await doFetch();
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data &&
      "message" in data &&
      (data as { message: unknown }).message
        ? Array.isArray((data as { message: unknown }).message)
          ? ((data as { message: string[] }).message).join(", ")
          : String((data as { message: unknown }).message)
        : `İstek başarısız (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export { API_URL };
