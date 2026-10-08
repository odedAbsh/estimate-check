import crypto from "node:crypto";
import type { NextFunction, Request, Response, Router } from "express";
import express from "express";
import { z } from "zod";
import type { Db } from "./db";

export interface AuthedUser {
  id: string;
  email: string;
}
declare module "express-serve-static-core" {
  interface Request {
    user?: AuthedUser;
  }
}

const COOKIE = "ec_session";
const SESSION_DAYS = 30;

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export interface AuthConfig {
  secureCookies: boolean;
  now: () => Date;
}

function setSessionCookie(res: Response, token: string, cfg: AuthConfig) {
  const maxAge = SESSION_DAYS * 24 * 3600;
  res.append("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.secureCookies ? "; Secure" : ""}`);
}
function clearSessionCookie(res: Response, cfg: AuthConfig) {
  res.append("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cfg.secureCookies ? "; Secure" : ""}`);
}

function createSession(db: Db, userId: string, cfg: AuthConfig): string {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(cfg.now().getTime() + SESSION_DAYS * 24 * 3600 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires);
  return token;
}

/** Loads req.user from the session cookie, if any. */
export function sessionMiddleware(db: Db, cfg: AuthConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) {
      const row = db
        .prepare("SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?")
        .get(sha256(token)) as { id: string; email: string; expires_at: string } | undefined;
      if (row && new Date(row.expires_at) > cfg.now()) req.user = { id: row.id, email: row.email };
    }
    next();
  };
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Sign in to continue.", code: "auth_required" });
  next();
}

/** Blocks cross-site form posts: mutating requests must come from our own origin. */
export function sameOriginOnly(allowedOrigins: () => string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers.host ? [`http://${req.headers.host}`, `https://${req.headers.host}`] : [];
      if (![...host, ...allowedOrigins()].includes(origin)) return res.status(403).json({ error: "Cross-site request blocked." });
    }
    next();
  };
}

/** Tiny fixed-window limiter keyed by IP+email, enough to slow password guessing. */
function limiter(max: number, windowMs: number, now: () => Date) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const t = now().getTime();
    const h = hits.get(key);
    if (!h || h.reset < t) {
      hits.set(key, { n: 1, reset: t + windowMs });
      return true;
    }
    h.n += 1;
    return h.n <= max;
  };
}

const Credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export function authRoutes(db: Db, cfg: AuthConfig): Router {
  const r = express.Router();
  const allow = limiter(10, 15 * 60 * 1000, cfg.now);

  r.get("/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });

  r.post("/register", (req, res) => {
    const parsed = Credentials.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(400).json({ error: issue.path[0] === "email" ? "Enter a valid email address." : issue.message });
    }
    const { email, password } = parsed.data;
    if (!allow(`${req.ip}|${email}`)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      return res.status(409).json({ error: "An account with this email already exists. Sign in instead.", code: "email_taken" });
    }
    const id = `u_${crypto.randomBytes(8).toString("hex")}`;
    db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(id, email, hashPassword(password), cfg.now().toISOString());
    setSessionCookie(res, createSession(db, id, cfg), cfg);
    res.status(201).json({ user: { id, email } });
  });

  r.post("/login", (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Enter your email and password." });
    if (!allow(`${req.ip}|${email}`)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
    const row = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) as { id: string; email: string; password_hash: string } | undefined;
    // Same work and same message whether or not the email exists.
    const ok = row ? verifyPassword(password, row.password_hash) : (verifyPassword(password, hashPassword("x")), false);
    if (!row || !ok) return res.status(401).json({ error: "That email and password don't match." });
    setSessionCookie(res, createSession(db, row.id, cfg), cfg);
    res.json({ user: { id: row.id, email: row.email } });
  });

  r.post("/logout", (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    clearSessionCookie(res, cfg);
    res.json({ ok: true });
  });

  return r;
}
