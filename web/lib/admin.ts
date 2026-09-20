import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

/**
 * The write path: replacing the member database from a workbook.
 *
 * Only President + MA reach this, and the tier is re-checked in the server
 * action rather than inferred from the fact that a form was submitted.
 *
 * Two steps, never one. A submitted file is STAGED and checked, and nothing
 * on disk changes; a second, separate action APPLIES it. An import that
 * quietly drops a sheet or loads forty rows where a hundred and fifty were
 * meant is worse than one that refuses, so the person pressing the button
 * sees the row counts first.
 *
 * The pipeline itself is not reimplemented here. It shells out to the same
 * scripts/load_data.py and scripts/export_json.py that build the demo, so
 * there is no second loader that can disagree with the first.
 */

const run = promisify(execFile);

/** The repository root. The web app runs from web/, the pipeline from above it. */
const REPO = path.resolve(process.cwd(), "..");
const UPLOADS = path.join(REPO, "data", "uploads");
const PYTHON = process.env.JCI_PYTHON || "python3";

/** A workbook this size is not a member list; refuse before reading it. */
const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT = [".xlsx", ".xlsm"];

export type SheetReport = {
  sheet: string;
  present: boolean;
  rows: number;
  missing_columns: string[];
  required?: boolean;
};

export type UploadReport = {
  ok: boolean;
  fatal: string | null;
  file?: string;
  sheets: SheetReport[];
  problems?: string[];
  member_count?: number;
  unknown_roles?: string[];
};

export type StagedFile = {
  name: string;
  size: number;
  uploaded_at: string;
  /** Who submitted it, from the filename the stager wrote. */
  uploaded_by: string;
};

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Filenames are ours, not the uploader's. Nothing from a form reaches a path. */
function safeName(memberId: string, original: string): string {
  const ext = path.extname(original).toLowerCase();
  return `${stamp()}__${memberId.replace(/[^A-Za-z0-9-]/g, "")}${ext}`;
}

export async function listStaged(): Promise<StagedFile[]> {
  try {
    const names = await fs.readdir(UPLOADS);
    const rows = await Promise.all(
      names
        .filter((n) => ALLOWED_EXT.includes(path.extname(n).toLowerCase()))
        .map(async (n) => {
          const s = await fs.stat(path.join(UPLOADS, n));
          const [, who = "—"] = n.replace(/\.[^.]+$/, "").split("__");
          return {
            name: n,
            size: s.size,
            uploaded_at: s.mtime.toISOString(),
            uploaded_by: who,
          };
        }),
    );
    return rows.sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
  } catch {
    return [];
  }
}

/** Resolve a staged filename to a path, refusing anything that escapes the directory. */
export function stagedPath(name: string): string | null {
  const resolved = path.resolve(UPLOADS, name);
  const inside = resolved.startsWith(UPLOADS + path.sep);
  return inside && ALLOWED_EXT.includes(path.extname(resolved).toLowerCase())
    ? resolved
    : null;
}

export async function stageWorkbook(
  file: File,
  memberId: string,
): Promise<{ name: string; report: UploadReport } | { error: string }> {
  if (!file || file.size === 0) return { error: "Choose a workbook to upload." };
  if (file.size > MAX_BYTES) {
    return { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB.` };
  }
  if (!ALLOWED_EXT.includes(path.extname(file.name).toLowerCase())) {
    return { error: "Upload the chapter workbook as .xlsx or .xlsm." };
  }

  await fs.mkdir(UPLOADS, { recursive: true });
  const name = safeName(memberId, file.name);
  const target = path.join(UPLOADS, name);
  await fs.writeFile(target, Buffer.from(await file.arrayBuffer()));

  const report = await validate(target);
  return { name, report };
}

export async function validate(absolutePath: string): Promise<UploadReport> {
  try {
    const { stdout } = await run(
      PYTHON,
      [path.join("scripts", "validate_upload.py"), absolutePath],
      { cwd: REPO, timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as UploadReport;
  } catch (err) {
    // A non-zero exit still carries a JSON report on stdout; anything else
    // is the checker itself failing, which the page should say plainly.
    const e = err as { stdout?: string; message?: string };
    if (e.stdout) {
      try {
        return JSON.parse(e.stdout) as UploadReport;
      } catch {
        /* fall through */
      }
    }
    return {
      ok: false,
      fatal: `Could not run the workbook check (${e.message ?? "unknown error"}). Is Python available?`,
      sheets: [],
    };
  }
}

export type ApplyResult = {
  ok: boolean;
  log: string;
  error?: string;
};

/**
 * Load the staged workbook into the database and rebuild every payload.
 *
 * Rebuilding is not optional. The payloads are the permission boundary --
 * each one holds only the fields its tier may see -- so a database that has
 * moved on from them is a database whose access rules are stale.
 */
export async function applyWorkbook(name: string): Promise<ApplyResult> {
  const source = stagedPath(name);
  if (!source) return { ok: false, log: "", error: "That staged file is no longer available." };

  const report = await validate(source);
  if (report.fatal || !report.ok) {
    return {
      ok: false,
      log: "",
      error:
        report.fatal ??
        `The workbook still has ${report.problems?.length ?? 0} problem(s). Fix them and upload again.`,
    };
  }

  const env = { ...process.env, JCI_SOURCE_XLSX: source };
  const chunks: string[] = [];
  for (const script of ["load_data.py", "export_json.py"]) {
    try {
      const { stdout, stderr } = await run(PYTHON, [path.join("scripts", script)], {
        cwd: REPO,
        env,
        timeout: 300_000,
        maxBuffer: 16 * 1024 * 1024,
      });
      chunks.push(`$ python scripts/${script}\n${stdout}${stderr ? `\n${stderr}` : ""}`);
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      chunks.push(`$ python scripts/${script}\n${e.stdout ?? ""}${e.stderr ?? e.message ?? ""}`);
      return {
        ok: false,
        log: chunks.join("\n\n"),
        error: `scripts/${script} failed. The database was not left half-loaded — rerun after fixing the workbook.`,
      };
    }
  }
  return { ok: true, log: chunks.join("\n\n") };
}
