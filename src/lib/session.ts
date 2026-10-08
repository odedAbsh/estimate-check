import { useCallback, useEffect, useState } from "react";

export interface User {
  id: string;
  email: string;
}
export type PaymentsMode = "stripe" | "demo" | "off";

async function json<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: T }> {
  const res = await fetch(url, { credentials: "same-origin", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  let body: unknown = {};
  try {
    body = await res.json();
  } catch {
    // empty or non-JSON body
  }
  return { ok: res.ok, status: res.status, body: body as T };
}

export async function api<T>(url: string, method = "GET", data?: unknown) {
  return json<T>(url, { method, body: data === undefined ? undefined : JSON.stringify(data) });
}

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [payments, setPayments] = useState<PaymentsMode>("off");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, cfg] = await Promise.all([api<{ user: User | null }>("/api/auth/me"), api<{ payments: PaymentsMode }>("/api/config")]);
        if (cancelled) return;
        if (me.ok) setUser(me.body.user);
        if (cfg.ok) setPayments(cfg.body.payments);
      } catch {
        // No server (static hosting): the app still works locally.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback(async (mode: "register" | "login", email: string, password: string): Promise<User> => {
    const r = await api<{ user?: User; error?: string }>(`/api/auth/${mode}`, "POST", { email, password });
    if (!r.ok || !r.body.user) throw new Error(r.body.error ?? "We couldn't sign you in. Try again.");
    setUser(r.body.user);
    return r.body.user;
  }, []);

  const logout = useCallback(async () => {
    await api("/api/auth/logout", "POST", {}).catch(() => undefined);
    setUser(null);
  }, []);

  return { user, payments, ready, authenticate, logout };
}
