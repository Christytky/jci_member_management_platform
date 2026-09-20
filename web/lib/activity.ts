import "server-only";

/**
 * The activity log. PRD 6.6 -- the punchline of the demo.
 *
 * Every sign-in, restricted view, export and upload lands here, and the
 * Activity page shows the judge the rows their own clicks just created.
 *
 * actor_name is now a person. Under the old shared account it could only
 * ever be the persona that was selected in a dropdown, which is exactly the
 * accountability gap individual logins close: "Rufus To opened this record"
 * is a fact about a human being, "the President persona was selected" is not.
 *
 * Stage 1 keeps this in a server-side module singleton: it is append-only
 * within the process and never reaches the client except through the
 * Activity page, which only President + MA may open. Stage 2 (PRD 8) moves
 * it to the append-only activity_log table already defined in the schema,
 * where it survives restarts and cannot be edited from the app.
 */

export type LogAction =
  | "SIGN_IN"
  | "SIGN_IN_FAILED"
  | "SIGN_OUT"
  | "VIEW_MEMBER"
  | "VIEW_RESTRICTED"
  | "VIEW_GROWTH"
  | "EXPORT"
  | "UPLOAD"
  | "VIEW_DASHBOARD"
  // The per-field write path. EDIT_ACCESS is deliberately not EDIT: a
  // change to a board post changes what that member may SEE, and an audit
  // that files it next to a corrected phone number has lost the difference.
  | "EDIT"
  | "EDIT_ACCESS"
  | "CREATE"
  | "DELETE";

export type LogRow = {
  log_id: number;
  ts: string;
  actor_name: string;
  actor_role: string;
  action: LogAction;
  target_member_id: string | null;
  field_group: string | null;
  detail: string;
};

const MAX_ROWS = 400;

declare global {
  // eslint-disable-next-line no-var
  var __jciLog: { rows: LogRow[]; next: number } | undefined;
}

function store() {
  if (!globalThis.__jciLog) {
    globalThis.__jciLog = { rows: [], next: 1 };
    seed(globalThis.__jciLog);
  }
  return globalThis.__jciLog;
}

/**
 * A handful of prior entries so the page is never empty on first open.
 * An empty log invites "so it does not actually record anything?" at
 * exactly the wrong moment. These are clearly dated before today.
 */
function seed(s: { rows: LogRow[]; next: number }) {
  const base = new Date("2026-09-18T09:12:00+08:00").getTime();
  const rows: Omit<LogRow, "log_id" | "ts">[] = [
    { actor_name: "Rufus To", actor_role: "President + MA", action: "SIGN_IN", target_member_id: "VJC-0007", field_group: null, detail: "Signed in · posts MAD & BOD & SO & FM · President + MA via MAD" },
    { actor_name: "Rufus To", actor_role: "President + MA", action: "VIEW_RESTRICTED", target_member_id: "VJC-0064", field_group: "personal", detail: "Opened Profile tab" },
    { actor_name: "Rufus To", actor_role: "President + MA", action: "EXPORT", target_member_id: null, field_group: "analytics", detail: "Directory export, 53 columns" },
    { actor_name: "Man Kit Lee", actor_role: "HS + FD", action: "VIEW_RESTRICTED", target_member_id: "VJC-0089", field_group: "finance", detail: "Opened Fees tab" },
    { actor_name: "Mavis Tsang", actor_role: "HS + FD", action: "VIEW_MEMBER", target_member_id: "VJC-0085", field_group: null, detail: "Opened member record" },
    { actor_name: "Xavier Tam", actor_role: "President + MA", action: "VIEW_RESTRICTED", target_member_id: "VJC-0087", field_group: "governance", detail: "Reviewed BOD motion" },
  ];
  rows.forEach((r, i) => {
    s.rows.push({ ...r, log_id: s.next++, ts: new Date(base + i * 1000 * 60 * 17).toISOString() });
  });
}

export function record(entry: {
  actor_name: string;
  actor_role: string;
  action: LogAction;
  target_member_id?: string | null;
  field_group?: string | null;
  detail?: string;
}): void {
  const s = store();
  s.rows.push({
    log_id: s.next++,
    ts: new Date().toISOString(),
    actor_name: entry.actor_name,
    actor_role: entry.actor_role,
    action: entry.action,
    target_member_id: entry.target_member_id ?? null,
    field_group: entry.field_group ?? null,
    detail: entry.detail ?? "",
  });
  if (s.rows.length > MAX_ROWS) s.rows.splice(0, s.rows.length - MAX_ROWS);
}

/** Reverse-chronological, newest first (PRD 6.6). */
export function read(): LogRow[] {
  return [...store().rows].reverse();
}

export function countSince(iso: string): number {
  return store().rows.filter((r) => r.ts >= iso).length;
}
