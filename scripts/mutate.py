"""Apply one member-record write, and report it as JSON.

The web layer shells out to this the same way it shells out to
validate_upload.py, and for the same reason: there is one implementation of
the rules, in Python, beside the table that defines them. A second copy in
TypeScript is a second copy that can disagree.

    python scripts/mutate.py '{"op":"update","tier":"HS + FD", ... }'
    echo '{"op": ...}' | python scripts/mutate.py      # stdin works too

The request may arrive as the first argument or on stdin. The argument form
is what the web layer uses, so it can call this through the same promisified
execFile wrapper lib/admin.ts uses for the workbook checker -- one way of
shelling out to Python in the codebase rather than two.

Always exits 0 with a JSON report on stdout, including for a refusal -- a
refusal is an answer, not a crash, and the caller shows its message to the
person who tried the write. A non-zero exit means this script itself failed.

It does NOT rebuild the payloads. The caller runs export_json.py after a
successful write, because the payloads are the permission boundary.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src import mutations as M  # noqa: E402


def dispatch(req: dict) -> dict:
    op = req.get("op")
    tier = req.get("tier") or ""
    actor = req.get("actor") or "unknown"

    if op == "update":
        return M.update_field(
            tier, actor,
            req.get("member_id") or "",
            req.get("field") or "",
            req.get("value"),
            req.get("reason"),
        )
    if op == "create":
        return M.create_member(tier, actor, req.get("values") or {})
    if op == "delete":
        return M.delete_member(
            tier, actor, req.get("member_id") or "", req.get("reason") or ""
        )
    if op == "fields":
        # What this permission level may write, for the form to render.
        return {
            "ok": True,
            "changed": False,
            "tier": tier,
            "groups": M.editable_groups(tier),
            "can_create": M.can_create(tier),
            "can_delete": M.can_delete(tier),
            "fields": [
                M.WRITABLE[f].as_dict() for f in M.editable_fields(tier)
            ],
        }
    raise M.Refused(f"Unknown operation '{op}'.")


def main() -> None:
    raw = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    try:
        req = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"ok": False, "changed": False, "error": f"Bad request: {exc}"}))
        return

    try:
        print(json.dumps(dispatch(req), default=str))
    except M.Refused as exc:
        # The expected failure. The message is written to be read by a person.
        print(json.dumps({"ok": False, "changed": False, "error": str(exc)}))
    except Exception as exc:  # noqa: BLE001 - reported, never swallowed
        print(json.dumps({
            "ok": False,
            "changed": False,
            "error": f"{type(exc).__name__}: {exc}",
        }))


if __name__ == "__main__":
    main()
