import { createHmac, timingSafeEqual } from "node:crypto";

export const sessionCookieName = "taxes_session";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function password(): string {
  const value = process.env.TAXES_AUTH_PASSWORD;
  if (!value) throw new Error("TAXES_AUTH_PASSWORD is not set.");
  return value;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function credentialsMatch(user: string, pass: string): boolean {
  const expectedUser = process.env.TAXES_AUTH_USER ?? "";
  const expectedPass = process.env.TAXES_AUTH_PASSWORD ?? "";
  if (!expectedUser || !expectedPass) return false;
  return safeEqual(user, expectedUser) && safeEqual(pass, expectedPass);
}

export function signSession(user: string, now = Date.now()): string {
  const exp = now + FOURTEEN_DAYS_MS;
  const payload = `${user}.${exp}`;
  const sig = createHmac("sha256", password()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !process.env.TAXES_AUTH_PASSWORD) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [user, exp, sig] = parts;
  if (!user || !exp || !sig) return false;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < now) return false;
  const expected = createHmac("sha256", password())
    .update(`${user}.${exp}`)
    .digest("hex");
  return safeEqual(sig, expected);
}
