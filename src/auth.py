"""Individual accounts. One login per member, not one shared password.

Until now the app ran on a unified account and a "viewing as" dropdown --
fine for a pitch, indefensible the moment real member data is behind it,
because the activity log could only ever record which persona was selected,
never who selected it.

An account here carries no permissions of its own. It carries a member_id;
the permission tier comes from that member's role record, through
roles.tier_for(). Promote a member and their access changes at their next
page load. Revoke a post and it narrows. There is no second place to edit.

Passwords are stored as PBKDF2-HMAC-SHA256 with a per-account salt. The
demo password is derived from the member id so the demo is reproducible,
and the derivation lives here rather than in the web app, which only ever
sees the hash.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets

import pandas as pd

from src import roles

PBKDF2_ROUNDS = 120_000
EMAIL_DOMAIN = "vjc.org.hk"

# Accounts are issued to members whose record is live. A removed or resigned
# member keeps their record -- the history is the point -- but cannot log in.
LOGIN_STATUSES = ("Active", "Pending Induction", "Pending Fee", "Pending BOD Motion")


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Returns (salt_hex, hash_hex). A fresh salt unless one is supplied."""
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ROUNDS
    )
    return salt, digest.hex()


def verify_password(password: str, salt: str, expected: str) -> bool:
    _, actual = hash_password(password, salt)
    return hmac.compare_digest(actual, expected)


def demo_password(member_id: str) -> str:
    """The seeded password for a demo account: VJC-0036 -> 'Victoria@0036'.

    Deterministic on purpose -- the whole demo has to be reproducible on any
    machine. Set JCI_DEMO_PASSWORD to override the scheme for a deployment
    where the accounts are seeded rather than demonstrated.
    """
    override = os.environ.get("JCI_DEMO_PASSWORD")
    if override:
        return override
    return f"Victoria@{member_id.split('-')[-1]}"


def username_for(row, taken: set[str]) -> str:
    """The chapter address where there is one, a derived one where there is not."""
    jci = row.get("jci_email")
    if jci and not pd.isna(jci) and str(jci).strip():
        candidate = str(jci).strip().lower()
    else:
        first = str(row["first_name"]).strip().lower().replace(" ", "")
        last = str(row["last_name"]).strip().lower().replace(" ", "")
        candidate = f"{first}.{last}@{EMAIL_DOMAIN}"

    if candidate not in taken:
        return candidate
    # Two members with the same name is a real possibility in a 150-member
    # chapter; the member id disambiguates without inventing a numbered alias.
    local, _, domain = candidate.partition("@")
    return f"{local}.{str(row['member_id']).split('-')[-1]}@{domain}"


def build_accounts(m: pd.DataFrame, salt_seed: str = "jci-victoria-2026") -> pd.DataFrame:
    """One account row per member, with the role record resolved to a tier.

    Salts are derived from a fixed seed rather than drawn randomly, so the
    seeded database is byte-identical on every load. A production seeder
    would pass no seed and let secrets.token_hex do the work.
    """
    annotated = m if "permission_tier" in m.columns else roles.annotate(m)
    taken: set[str] = set()
    rows = []

    for _, r in annotated.sort_values("member_id").iterrows():
        username = username_for(r, taken)
        taken.add(username)

        member_id = r["member_id"]
        salt = hashlib.sha256(f"{salt_seed}:{member_id}".encode()).hexdigest()[:32]
        _, digest = hash_password(demo_password(member_id), salt)

        rows.append(
            {
                "username": username,
                "member_id": member_id,
                "display_name": r.get("full_name")
                or f"{r['first_name']} {r['last_name']}".strip(),
                "password_salt": salt,
                "password_hash": digest,
                "is_enabled": "Y" if r["member_status"] in LOGIN_STATUSES else "N",
                # Denormalised for the login screen and the activity log only.
                # The permission check always re-derives from the role record.
                "roles": r["roles"],
                "role_record": r["role_record"],
                "permission_tier": r["permission_tier"],
                "governing_role": r["governing_role"],
            }
        )
    return pd.DataFrame(rows)


def authenticate(accounts: pd.DataFrame, username: str, password: str) -> dict | None:
    """None for every failure -- bad user, bad password, disabled account.

    One undifferentiated failure so the form cannot be used to enumerate who
    holds an account in the chapter.
    """
    hit = accounts[accounts["username"].str.lower() == username.strip().lower()]
    if hit.empty:
        return None
    row = hit.iloc[0]
    if row["is_enabled"] != "Y":
        return None
    if not verify_password(password, row["password_salt"], row["password_hash"]):
        return None
    return {k: row[k] for k in row.index if not k.startswith("password_")}


def demo_roster(accounts: pd.DataFrame, limit_per_tier: int = 1) -> list[dict]:
    """A few representative accounts to print on the login screen.

    Synthetic data, seeded passwords -- this panel is what makes the tier
    model demonstrable in twenty seconds. It has no place on a deployment
    holding real records; gate it on JCI_DEMO_ACCOUNTS.
    """
    order = {code: i for i, code in enumerate(roles.CATALOGUE)}
    out = []
    for tier in roles.TIERS:
        rows = accounts[(accounts["permission_tier"] == tier) & (accounts["is_enabled"] == "Y")]
        # Catalogue order, so the admin tier demonstrates as the President
        # rather than as whichever MA officer sorts first by member id.
        rows = rows.assign(_o=rows["governing_role"].map(lambda c: order.get(c, 999)))
        rows = rows.sort_values(["_o", "member_id"])
        for _, r in rows.head(limit_per_tier).iterrows():
            out.append(
                {
                    "username": r["username"],
                    "password": demo_password(r["member_id"]),
                    "display_name": r["display_name"],
                    "role_record": r["role_record"],
                    "permission_tier": tier,
                    "governing_role": r["governing_role"],
                }
            )
    return out
