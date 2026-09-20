import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";

/**
 * Individual logins.
 *
 * An account carries a member_id and nothing else that matters. The
 * permission tier is not stored on the session -- it is read from the
 * account record, which the exporter derived from that member's ROLE
 * RECORD by taking the highest role they hold. Promote a member and their
 * access widens at their next request; the cookie they are holding does
 * not need to be reissued, because it never contained a permission.
 *
 * "server-only" above is load-bearing twice over: it keeps password hashes
 * out of any client bundle, and it keeps the session secret there too.
 */

export type Tier =
  | "President + MA"
  | "HS + FD"
  | "Board / Chairman / SO"
  | "Member";

export type Account = {
  username: string;
  member_id: string;
  display_name: string;
  password_salt: string;
  password_hash: string;
  is_enabled: "Y" | "N";
  /** "MAD; BOD; SO; FM" -- every role held, highest tier first. */
  roles: string;
  /** "MAD & BOD & SO & FM" -- the role record as the chapter writes it. */
  role_record: string;
  /** Derived from roles, highest wins. Never typed in by hand. */
  permission_tier: Tier;
  /** The one role that decided the tier. */
  governing_role: string | null;
};

/** What the rest of the app is allowed to know about the signed-in user. */
export type Session = {
  username: string;
  member_id: string;
  display_name: string;
  roles: string[];
  role_record: string;
  tier: Tier;
  governing_role: string | null;
};

const DATA_DIR = path.join(process.cwd(), "data");
const COOKIE = "jci_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // one working day
const PBKDF2_ROUNDS = 120_000;

/**
 * In development the secret falls back to a fixed string so `next dev` works
 * with no setup. In production it must be supplied, and the app refuses to
 * issue a session without it rather than signing cookies with a value that
 * is printed in this file.
 */
function secret(): string {
  const fromEnv = process.env.JCI_SESSION_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JCI_SESSION_SECRET must be set in production");
  }
  return "dev-only-jci-victoria-session-secret";
}

let accountCache: Account[] | null = null;

async function accounts(): Promise<Account[]> {
  if (accountCache) return accountCache;
  const raw = await fs.readFile(path.join(DATA_DIR, "accounts.json"), "utf8");
  accountCache = JSON.parse(raw) as Account[];
  return accountCache;
}

function pbkdf2(password: string, saltHex: string): string {
  return crypto
    .pbkdf2Sync(password, Buffer.from(saltHex, "hex"), PBKDF2_ROUNDS, 32, "sha256")
    .toString("hex");
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak.
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function toSession(a: Account): Session {
  return {
    username: a.username,
    member_id: a.member_id,
    display_name: a.display_name,
    roles: a.roles ? a.roles.split(";").map((r) => r.trim()).filter(Boolean) : [],
    role_record: a.role_record,
    tier: a.permission_tier,
    governing_role: a.governing_role,
  };
}

/**
 * One undifferentiated failure for every reason. A form that says "no such
 * user" tells an outsider who is in the chapter.
 */
export async function verifyCredentials(
  username: string,
  password: string,
): Promise<Session | null> {
  const wanted = username.trim().toLowerCase();
  const all = await accounts();
  const hit = all.find((a) => a.username.toLowerCase() === wanted);

  if (!hit || hit.is_enabled !== "Y") {
    // Hash anyway, so a missing account does not answer faster than a wrong
    // password and turn the form into a membership lookup.
    pbkdf2(password, "00".repeat(16));
    return null;
  }
  if (!sameString(pbkdf2(password, hit.password_salt), hit.password_hash)) {
    return null;
  }
  return toSession(hit);
}

// --------------------------------------------------------------------------
// Session cookie: base64url(payload).base64url(hmac). Signed, not encrypted
// -- it holds a username and an expiry, no permissions and no member data.
// --------------------------------------------------------------------------

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(username: string): string {
  const body = Buffer.from(
    JSON.stringify({ u: username, exp: Date.now() + MAX_AGE_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string | undefined): string | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac || !sameString(mac, sign(body))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed.u !== "string" || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Date.now()) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

export async function startSession(username: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encode(username), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * The signed-in user, or null. Re-reads the account on every call rather
 * than trusting the cookie: an account disabled a minute ago stops working
 * on the next request, and a role added a minute ago takes effect on it.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const username = decode(jar.get(COOKIE)?.value);
  if (!username) return null;
  const hit = (await accounts()).find((a) => a.username === username);
  if (!hit || hit.is_enabled !== "Y") return null;
  return toSession(hit);
}

export type DemoAccount = {
  username: string;
  password: string;
  display_name: string;
  role_record: string;
  permission_tier: Tier;
  governing_role: string | null;
};

/**
 * Seeded logins printed on the sign-in screen. The data behind them is
 * synthetic -- the workbook's names are invented and contact details are
 * regenerated by the loader; set JCI_DEMO_ACCOUNTS=0 and
 * rebuild the payloads to ship an empty list for a real deployment.
 */
export async function demoAccounts(): Promise<DemoAccount[]> {
  if (process.env.JCI_DEMO_ACCOUNTS === "0") return [];
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "demo-accounts.json"), "utf8");
    return JSON.parse(raw) as DemoAccount[];
  } catch {
    return [];
  }
}
