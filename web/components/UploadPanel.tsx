"use client";

import { useActionState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  TriangleAlert,
  Upload,
} from "lucide-react";

import { apply, stage, type UploadState } from "@/app/(app)/upload/actions";

/**
 * Stage, then apply. Two buttons, never one.
 *
 * The gap between them is the feature: an import that silently drops a
 * sheet does more damage than one that refuses, so the person pressing
 * "Replace" has already seen the row counts, the missing columns and any
 * role code the catalogue does not recognise.
 */
export function UploadPanel({ canWrite }: { canWrite: boolean }) {
  const [staged, stageAction, staging] = useActionState<UploadState, FormData>(stage, null);
  const [applied, applyAction, applying] = useActionState<UploadState, FormData>(apply, null);

  const state = applied ?? staged;
  const report = staged?.report;
  const ready = Boolean(staged?.staged && report?.ok && !applied?.applied);

  return (
    <div className="space-y-5">
      <form action={stageAction} className="space-y-3">
        <label
          htmlFor="workbook"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed
                     border-surface-rule bg-surface-sunken px-4 py-5 transition-colors hover:border-jci-blue"
        >
          <FileSpreadsheet className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">Choose the chapter workbook</span>
            <span className="block text-[11.5px] text-ink-faint">
              .xlsx or .xlsm, up to 25 MB — the five sheets the loader expects
            </span>
          </span>
        </label>
        <input
          id="workbook"
          name="workbook"
          type="file"
          accept=".xlsx,.xlsm"
          required
          disabled={!canWrite || staging}
          className="focus-ring block w-full rounded-xl border border-surface-rule bg-surface px-3.5
                     py-2 text-[12.5px] file:mr-3 file:rounded-lg file:border-0 file:bg-surface-sunken
                     file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink-muted"
        />
        <button
          type="submit"
          disabled={!canWrite || staging}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-jci-blue px-4 py-2.5
                     text-[13px] font-semibold text-white transition-colors hover:bg-jci-navy
                     disabled:opacity-60"
        >
          {staging ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {staging ? "Checking the workbook…" : "Upload and check"}
        </button>
      </form>

      {state?.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-risk/10 px-4 py-3 text-[12.5px] leading-5 text-risk"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      )}

      {applied?.applied && (
        <p className="flex items-start gap-2 rounded-xl bg-ok/10 px-4 py-3 text-[12.5px] leading-5 text-ok">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Database reloaded and every tier payload rebuilt. Reload any open page to see the
          new records.
        </p>
      )}

      {report && <Report report={report} />}

      {ready && (
        <form action={applyAction} className="rounded-xl border border-warn/30 bg-warn/10 p-4">
          <input type="hidden" name="staged" value={staged?.staged ?? ""} />
          <p className="flex items-start gap-2 text-[12.5px] leading-5 text-[#8A4A08]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              Applying replaces every row in the member database with this workbook and
              rebuilds the payload each tier is served. The previous file stays in
              data/uploads. This is written to the activity log under your name.
            </span>
          </p>
          <button
            type="submit"
            disabled={applying}
            className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl bg-[#8A4A08]
                       px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity
                       hover:opacity-90 disabled:opacity-60"
          >
            {applying && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {applying ? "Loading and rebuilding…" : "Replace the member database"}
          </button>
        </form>
      )}

      {state?.log && (
        <details className="rounded-xl border border-surface-rule">
          <summary className="cursor-pointer px-4 py-2.5 text-[12px] font-semibold text-ink-muted">
            Pipeline output
          </summary>
          <pre className="overflow-x-auto border-t border-surface-rule px-4 py-3 text-[11px] leading-5 tnum text-ink-muted">
            {state.log}
          </pre>
        </details>
      )}
    </div>
  );
}

function Report({ report }: { report: NonNullable<UploadState>["report"] }) {
  if (!report) return null;

  return (
    <div className="rounded-xl border border-surface-rule">
      <div className="flex items-center gap-2 border-b border-surface-rule px-4 py-2.5">
        {report.ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-risk" aria-hidden />
        )}
        <span className="text-[13px] font-semibold">
          {report.ok ? "Workbook passed every check" : "Workbook cannot be applied"}
        </span>
        {report.member_count !== undefined && (
          <span className="chip ml-auto bg-surface-sunken text-ink-muted tnum">
            {report.member_count} members
          </span>
        )}
      </div>

      <div className="px-4 py-3">
        {report.fatal ? (
          <p className="text-[12.5px] text-risk">{report.fatal}</p>
        ) : (
          <table className="table-jci">
            <thead>
              <tr>
                <th>Sheet</th>
                <th>Rows</th>
                <th>Columns</th>
              </tr>
            </thead>
            <tbody>
              {report.sheets.map((s) => (
                <tr key={s.sheet}>
                  <td className="font-semibold">{s.sheet}</td>
                  <td className="tnum text-ink-muted">{s.present ? s.rows : "—"}</td>
                  <td className="text-ink-muted">
                    {!s.present ? (
                      <span className="text-risk">missing sheet</span>
                    ) : s.missing_columns.length ? (
                      <span className="text-risk">
                        missing {s.missing_columns.join(", ")}
                      </span>
                    ) : (
                      "all present"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {report.problems && report.problems.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {report.problems.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[12px] leading-5 text-ink-muted">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
