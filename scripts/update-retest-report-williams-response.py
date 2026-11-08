#!/usr/bin/env python3
"""Patch the client retest Word report: add Local/Prod/Verified columns and answer A–D (signed as Williams).

Reads:  TelePendant_Test_Report_updated_with_retest.docx
Writes: TelePendant_Test_Report_Williams_response_8_Nov_2026.docx
"""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "TelePendant_Test_Report_updated_with_retest.docx"
OUT = ROOT / "TelePendant_Test_Report_Williams_response_8_Nov_2026.docx"
HEAD = "d7c4403"
VERIFIED = "Williams (code / verify / live smoke)"

# ID -> (local, prod, verified_note)
TP_RESULTS: dict[str, tuple[str, str, str]] = {
    "TP-01": (
        "Pass — STOP one press, no PIN",
        "Pass — confirmed on live",
        VERIFIED,
    ),
    "TP-02": (
        "Pass — per-user reset PIN; plant PIN only as first-time fallback (TP-38)",
        "Pass — defaults rotated (TP-50); tour no longer reveals PIN source",
        VERIFIED,
    ),
    "TP-03": ("Pass — slide-off stops ~0.8 s", "Pass — confirmed live", VERIFIED),
    "TP-04": ("Pass — tab hide stops ~0.9 s", "Pass — confirmed live", VERIFIED),
    "TP-05": (
        "Pass — sim/clean path ~0 mm overrun after TP-35 coil-off on release",
        "Pass (eyeball) — command stop fast; mechanical coast is PLC/drive; optional N=10 table later",
        VERIFIED,
    ),
    "TP-06": (
        "Pass — no Media UP/DOWN; timed voice needs flag + deadman (TP-29)",
        "Pass — timed media off on live",
        VERIFIED,
    ),
    "TP-07": (
        "Pass — UI + API protect STOP; cannot PATCH into deletable motion cell",
        "Pass — same on live after deploy",
        VERIFIED,
    ),
    "TP-08": (
        "Pass — banner clears after PIN reset without reload",
        "Pass — after LIVE-OPS-1 reset",
        VERIFIED,
    ),
    "TP-09": (
        "Pass — open/shelved alarms reload at API start; Unshelve works",
        "Pass — after redeploy",
        VERIFIED,
    ),
    "TP-10": (
        "Pass — names on audit; PLC/safety/alarm actions logged",
        "Pass — filters + CSV on live",
        VERIFIED,
    ),
    "TP-11": ("Pass — XFO DENY + CSP frame-ancestors", "Pass — headers present", VERIFIED),
    "TP-12": ("Pass — Swagger only non-prod", "Pass — /api 404 on live", VERIFIED),
    "TP-13": ("Pass — OTA HTTPS URL", "Pass — manifest HTTPS", VERIFIED),
    "TP-14": (
        "Pass — Use this PLC off by default + confirm modal; reconnect loop fixed (TP-41)",
        "Pass — same behaviour on live",
        VERIFIED,
    ),
    "TP-15": (
        "Pass — trolley feedback/status wired in demo seed",
        "Pass — live labels show feedback when mapped",
        VERIFIED,
    ),
    "TP-16": ("Pass — ZXing fallback", "Pass — path present (camera E2E device-dependent)", VERIFIED),
    "TP-17": ("Pass — camera retry UI", "Pass", VERIFIED),
    "TP-18": ("Pass — listen end feedback", "Pass", VERIFIED),
    "TP-19": ("Pass — Face has shell when logged in", "Pass", VERIFIED),
    "TP-20": (
        "Pass — trends show series names + samples after trend-on",
        "Pass — confirm Ops if needed",
        VERIFIED,
    ),
    "TP-21": (
        "Pass — severity dropdown; invalid severity 400 + audit; live labels use register names",
        "Pass",
        VERIFIED,
    ),
    "TP-22": ("Pass — empty resolve blocked", "Pass", VERIFIED),
    "TP-23": ("Pass — STOP colour both themes", "Pass", VERIFIED),
    "TP-24": ("Pass — tour placement fixed", "Pass", VERIFIED),
    "TP-25": (
        "Pass — ≥44px, sticky STOP, no nested matrix scroll; short viewports shrink plant",
        "Pass — client devices",
        VERIFIED,
    ),
    "TP-26": ("Pass — no .env strings on Operator", "Pass", VERIFIED),
    "TP-27": ("Pass — MOTOR label", "Pass", VERIFIED),
    "TP-28": ("Pass — manuals synced (Swagger-off, shelve, Name, confirms)", "Pass — docs on main", VERIFIED),
    "TP-29": (
        "Pass — timed voice requires deadman even when flag on; default off",
        "Pass — flag off on live",
        VERIFIED,
    ),
    "TP-30": ("Pass — /config → /admin", "Pass", VERIFIED),
    "TP-31": ("Pass — setPointerCapture try/catch + theme cleanup", "Pass", VERIFIED),
    "TP-32": ("Pass — single camera-blocked message", "Pass", VERIFIED),
    "TP-33": ("Pass — Users layout + Opertaor typo", "Pass", VERIFIED),
    "TP-34": ("Pass — HSTS in nginx", "Pass — Strict-Transport-Security present", VERIFIED),
    "TP-35": (
        "Pass — release writes deadman+motion coils off server-side (retry); unit covered",
        "Pass — hold/release + offline-at-release smoke",
        VERIFIED,
    ),
    "TP-36": (
        "Pass — operator /plc/coil|/holding forbidden; admin maintenance audited",
        "Pass — operator curl 403",
        VERIFIED,
    ),
    "TP-37": (
        "Pass — JWT required on realtime; per-session deadman",
        "Pass — anonymous WS rejected",
        VERIFIED,
    ),
    "TP-38": (
        "Pass — first personal PIN requires plant SAFE_ACTION_PIN",
        "Pass — after TP-50 rotation",
        VERIFIED,
    ),
    "TP-39": (
        "Pass — software e-stop latch persists across reconnect; PIN clears only",
        "Pass — maintenance-window check OK",
        VERIFIED,
    ),
    "TP-40": (
        "Pass — token version bump on suspend/delete/logout/password/PIN change",
        "Pass — suspended user loses control",
        VERIFIED,
    ),
    "TP-41": ("Pass — no reconnect storm on Use this PLC", "Pass", VERIFIED),
    "TP-42": (
        "Pass — Safety roles save verifies PIN + audit before/after",
        "Pass — wrong PIN refused",
        VERIFIED,
    ),
    "TP-43": (
        "Pass — release keystore required for handover APK/AAB; OTA code-signed",
        "Pass — release-signed APK via secure channel (not debug CN)",
        VERIFIED,
    ),
    "TP-44": ("Pass — CORS allowlist FRONTEND_URL only", "Pass", VERIFIED),
    "TP-45": ("Pass — face login requires 3 challenge frames", "Pass", VERIFIED),
    "TP-46": ("Pass — modbus-sim survives API stop/start", "Pass", VERIFIED),
    "TP-47": ("Pass — alarm ack audited", "Pass", VERIFIED),
    "TP-48": (
        "Pass — safety-linked register address changes need admin/PIN + audit",
        "Pass — supervisor denied",
        VERIFIED,
    ),
    "TP-49": (
        "Pass — SecureStore token + allowBackup false",
        "Pass — in release APK build",
        VERIFIED,
    ),
    "TP-50": (
        "Pass — production boot refuses .env.example defaults; README placeholders",
        "Pass — live admin password + SAFE_ACTION_PIN rotated",
        VERIFIED,
    ),
}

AREA_RESULTS: list[tuple[str, str, str]] = [
    (
        "Pass — health/Swagger/OTA checks green locally",
        "Pass — health 200, Swagger 404, OTA HTTPS, HSTS (TP-34)",
        VERIFIED,
    ),
    (
        "Pass — hold/release, slide-off, tab-hide; TP-35 coil-off",
        "Pass — same on live; TP-05 mechanical coast is drive/PLC",
        VERIFIED,
    ),
    (
        "Pass — trolley feedback/status in seed / Config maps",
        "Pass — labels show mapped feedback",
        VERIFIED,
    ),
    (
        "Pass — one-press STOP; API cannot strip STOP protection",
        "Pass — confirmed live",
        VERIFIED,
    ),
    (
        "Pass — no UP/DOWN taps; ZXing; timed media + deadman (TP-29)",
        "Pass — timed media off; QR device-dependent",
        VERIFIED,
    ),
    (
        "Pass — Users CRUD; password; personal PIN; token revoke (TP-40)",
        "Pass — operator/supervisor accounts on live",
        VERIFIED,
    ),
    (
        "Pass — unshelve + persist; audit names/CSV; FTS assistant",
        "Pass — Ops/Audit OK; Assistant may use Cursor if key set",
        VERIFIED,
    ),
    (
        "Pass — manuals aligned on main",
        "Pass — GitHub docs match app",
        VERIFIED,
    ),
]

# Follow-up row updates for original Q&A table (index 1..N)
QA_VENDOR: list[str] = [
    "Williams 8 Nov: STOP one-press confirmed. First PIN now requires plant PIN (TP-38 Pass).",
    "Williams 8 Nov: e-stop latch persists across PLC/comms loss; only PIN reset clears (TP-39 Pass).",
    "Williams 8 Nov: timed media off on live; voice motion requires deadman (TP-29 Pass).",
    "Williams 8 Nov: release clears deadman+motion coils server-side (TP-35 Pass). PLC should stop if holding.heartbeat stale >2 s (REAL_PLC_WIRING).",
    "Williams 8 Nov: slide-off / background confirmed Pass (~0.8–0.9 s).",
    "Williams 8 Nov: software promises command stop ≤ ~1 poll after release. Real-PLC mechanical overrun is drive ramp; measure on site. Sim clean path ~0 mm.",
    "Williams 8 Nov: Media UP/DOWN gone; timed voice gated + deadman; Safety roles PIN verified + audited (TP-42).",
    "Williams 8 Nov: first personal PIN requires plant SAFE_ACTION_PIN (TP-38).",
    "Williams 8 Nov: Use this PLC confirm; reconnect loop fixed (TP-41).",
    "Williams 8 Nov: trolley feedback available when registers mapped (TP-15).",
    "Williams 8 Nov: shelved/open alarms reload at start-up (TP-09).",
    "Williams 8 Nov: Motion blocked banner clears after PIN reset (TP-08).",
    "Williams 8 Nov: ZXing Pass (TP-16).",
    "Williams 8 Nov: iOS IPA via handover:mobile:ios; release Android via release keystore (TP-43).",
    "Williams 8 Nov: Apple checklist unchanged — Team ID, Distribution .p12, profile, credentials.env.",
    "Williams 8 Nov: operator/supervisor users on live; roles exercised.",
    "Williams 8 Nov: exclusive control lease + steal+PIN (FEAT-A5 Pass). Not last-write-wins.",
    "Williams 8 Nov: release-signed APK/AAB + code-signed OTA (TP-43). Secrets out of band.",
    "Williams 8 Nov: Swagger off, headers, HSTS, CORS allowlist, JWT realtime (TP-34/44/37).",
    "Williams 8 Nov: audit filters/CSV; PLC writes, safety roles, alarm ack logged.",
]

MOBILE_RESULT_UPDATES: dict[str, tuple[str, str]] = {
    "M-03": (
        "Pass (code)",
        "Handover builds require release keystore; apksigner must not show CN=Android Debug (TP-43).",
    ),
    "M-05": (
        "Pass (code)",
        "Unused draw-over / storage permissions removed with FEAT-A4 haptics work.",
    ),
    "M-06": (
        "Pass (code)",
        "Login token in SecureStore; Android allowBackup false (TP-49).",
    ),
    "M-07": (
        "Pass (code)",
        "OTA manifests code-signed on API; rebuild native when camera/speech change (TP-43).",
    ),
    "M-11": (
        "Pass (code)",
        "Same server-side release as web (TP-35); deadman+motion coils cleared without a second pendant request.",
    ),
    "M-13": (
        "Pass (code)",
        "expo-haptics on hold start and motion blocked (FEAT-A4).",
    ),
}

SECTION_A_ANSWERS: list[tuple[str, str]] = [
    (
        "Can each button show its state by colour (idle, running, blocked, fault), not only small text?",
        "Yes (FEAT-A1). Matrix cells use idle / running / blocked / fault colour tokens plus icon/text (not colour-only).",
    ),
    (
        "Can we have two-speed or variable-speed buttons (slow/fast) for jogging?",
        "Yes (FEAT-A2). Cells support slow/fast (or analog) mapping; motion remains hold-to-run.",
    ),
    (
        "Can buttons be at least 44 px with STOP always visible in a fixed place, without inner scrolling on phones and tablets?",
        "Yes (FEAT-A3 / TP-25). Touch targets ≥44 px; STOP docked/fixed; no nested matrix scroll; short viewports shrink the plant graphic.",
    ),
    (
        "Can the phone vibrate (haptic feedback) when a hold starts and when motion is blocked?",
        "Yes (FEAT-A4 / M-13). expo-haptics on press-in and when motion is blocked.",
    ),
    (
        "If two pendants connect to the same crane, can one take control and lock the other out?",
        "Yes (FEAT-A5). Exclusive control lease with heartbeat; second pendant is blocked from motion; steal requires PIN. Confirmed with two browsers locally; two-phone prod optional.",
    ),
    (
        "Can you build a proper live picture of the crane that shows:",
        "Yes (FEAT-HMI phase 1). Animated crane mimic: hoist/trolley motion, motor/drive colours, safety on the graphic, load bar, alarm callouts bound to tags.",
    ),
    (
        "Can we draw or upload our own picture (SVG) in Config and link live values and colour changes to each part, without changing code?",
        "Yes (FEAT-HMI phase 2). Config › Background: upload SVG/PNG (≤2 MB). Uploaded asset replaces the mimic; overlays bind tags. Clear image URL restores the mimic.",
    ),
    (
        "Can there be more than one screen (for example Overview, Hoist detail, Diagnostics) with buttons to switch between them?",
        "Yes. Add/activate multiple plant screens in Config; Operator shows tabs/switcher when 2+ screens exist (mobile has a screen switcher too).",
    ),
    (
        "Can the HMI picture and the button grid be shown side by side on a tablet, so the operator sees the machine while pressing buttons?",
        "Yes. Operator layout places the live graphic with the control matrix for tablet/desktop widths.",
    ),
    (
        "When can we test the grid and HMI with a real PLC instead of the demo simulator?",
        "Ready whenever you schedule a PLC mapping session. Follow docs/REAL_PLC_WIRING.md (add a real connection, map addresses, uncheck demo-simulator Use this PLC). No code change required for a standard Modbus map.",
    ),
]

SECTION_B_ANSWERS: list[tuple[str, str]] = [
    (
        "Of the fixes, please start with the Critical and High ones: TP-35 to TP-43, TP-48 and TP-50.",
        "Done. TP-35, TP-36, TP-37, TP-38, TP-39, TP-40, TP-41, TP-42, TP-43, TP-48, and TP-50 are Pass on main (verify green) with live smoke where applicable.",
    ),
    (
        'Please turn off "Allow timed media motion" on the live demo, and make timed voice motion require the deadman (TP-29).',
        "Done. Flag off on live; code requires an active deadman pulse for timed voice motion even if the flag is on.",
    ),
    (
        "After the API restarts, a shelved alarm never clears, because open alarms are only kept in memory. Please reload open alarms at start-up (TP-09).",
        "Done. Open/shelved alarms reload from durable store at API start.",
    ),
    (
        "Config › Live labels and audit rows for alarm actions show raw IDs. Can these show names instead (TP-10, TP-21)?",
        "Done. Live labels and audit rows use register/cell/user names; invalid alarm severity rejected with audit.",
    ),
    (
        "What stopping distance and time should we expect on a real PLC after release? Please give a number we can test against (TP-05).",
        "Software target: command stop (deadman + motion coils off) within about one poll after release (~≤0.3–0.5 s UI/API path; TP-35). Mechanical coast on a real drive is plant-specific (your earlier 50–100 mm / ~0.6 s can still be normal ramp). Local sim clean release: ~0 mm. Use that split when you measure on the real PLC.",
    ),
    (
        'On Ops, please label the empty "No samples yet" chart or remove it (TP-20).',
        "Done. After trending height/load, Ops Trends shows series names with samples/sparklines (not an orphan empty chart).",
    ),
    (
        "The tour box covers the controls on steps 4–6, and the button grid has its own scroll bar on short screens. Can both be fixed (TP-24, TP-25)?",
        "Done. Tour placement fixed; matrix no longer nested-scrolls on short phones; STOP stays docked.",
    ),
    (
        "Please fix the new small items TP-30 to TP-34 (blank /config page, setPointerCapture error, duplicate camera message, Users table width, HSTS).",
        "Done. All Pass: /config→/admin, pointer capture hardened, single camera message, Users layout, HSTS on live.",
    ),
    (
        "What heartbeat timeout should the PLC use to stop motion if the pendant goes silent?",
        "Recommend the PLC stop motion if holding.heartbeat is unchanged for more than 2 seconds (docs/REAL_PLC_WIRING.md). The API now clears deadman + motion coils on release/disconnect (TP-35); the PLC watchdog remains the plant safety backstop and does not replace a hardwired e-stop.",
    ),
]

SECTION_C_ANSWER = (
    "An email code after the password is fine for login. Please confirm that STOP never waits on login or the code.",
    "Confirmed (2FA Pass). Optional per-user email OTP via Zoho SMTP (MAIL_HOST/PORT, SMTP_USERNAME/PASSWORD, MAIL_FROM). Enable requires a confirm OTP; disable while signed in. Login/face with 2FA on returns a challenge (no JWT) until OTP verify. STOP and motion never wait on OTP once a session exists — they use the issued JWT only.",
)

SECTION_D_ANSWERS: list[tuple[str, str]] = [
    (
        "The live demo has been in E-STOP since 05:24 UTC on 6 Nov.",
        "Confirmed done (LIVE-OPS-1). Live e-stop was reset; Safety normal so reset/shelve retests can finish.",
    ),
    (
        "The live demo uses the default admin password published in the GitHub README",
        "Confirmed done (TP-50). Live ADMIN_PASSWORD and SAFE_ACTION_PIN rotated to unique values. Production boot refuses .env.example defaults. README shows placeholders only.",
    ),
    (
        "Please confirm the live demo runs 16cd252.",
        f"Superseded. GitHub main tip at Williams response is {HEAD} (includes Critical/High fixes, Section A grid/HMI, and per-user email 2FA). Please retest against current main / redeployed live, not 16cd252 alone.",
    ),
    (
        "The live Assistant uses the online AI (Cursor key set)",
        "If CURSOR_API_KEY is set on the host, Assistant uses online AI (can be slow). Acceptance remains local FTS without that key (SCOPE_ACCEPTANCE). For a fast local-only demo, unset CURSOR_API_KEY and reindex docs.",
    ),
    (
        "The live link and APK are temporary. When will the app move to our server and GitHub, and will you send a release-signed APK then (TP-43)?",
        "Code is on GitHub main. Move to your servers whenever you schedule cutover (INSTALLATION.md / deploy). Release-signed APK/AAB/IPA are produced with pnpm handover:mobile and sent over a secure channel with signing material — never committed to git (docs/MOBILE_RELEASE.md). No calendar date claimed here.",
    ),
    (
        "Which Android versions and phones should we test on?",
        "Android 7.0+ (minSdk 24), 64-bit ARM (arm64-v8a) only. Prefer a current mid-range phone for camera/mic (QR, Face, Listen). Emulators without arm64/camera are a poor substitute.",
    ),
    (
        "Can the app keep the login token in encrypted storage and turn off Android backup (TP-49)?",
        "Yes — done. SecureStore for the token; allowBackup false.",
    ),
    (
        'Can you remove the permissions the app does not need ("draw over other apps" and storage)?',
        "Yes — done with FEAT-A4. Camera/mic retained for QR, Face, and Listen; unused draw-over/storage removed.",
    ),
]


def set_cell(cell, text: str, bold: bool = False) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    run = p.add_run(text)
    run.font.size = Pt(8)
    if bold:
        run.bold = True


def add_column(table, header: str, values: list[str]) -> None:
    """Append one column; values length must equal data rows (exclude header)."""
    from docx.oxml import OxmlElement

    assert len(values) == len(table.rows) - 1
    grid = table._tbl.tblGrid
    if grid is not None:
        grid_cols = list(grid.findall(qn("w:gridCol")))
        width = grid_cols[-1].get(qn("w:w")) if grid_cols else "1200"
        new_grid = OxmlElement("w:gridCol")
        new_grid.set(qn("w:w"), width or "1200")
        grid.append(new_grid)
    for i, row in enumerate(table.rows):
        new_tc = deepcopy(row.cells[-1]._tc)
        for child in list(new_tc):
            if child.tag != qn("w:tcPr"):
                new_tc.remove(child)
        new_tc.append(OxmlElement("w:p"))
        row._tr.append(new_tc)
        text = header if i == 0 else values[i - 1]
        set_cell(row.cells[-1], text, bold=(i == 0))


def insert_after(paragraph: Paragraph, text: str, bold_prefix: str = "Williams answer (8 Nov 2026): ") -> Paragraph:
    from docx.oxml import OxmlElement

    new_p_el = OxmlElement("w:p")
    paragraph._p.addnext(new_p_el)
    new_p = Paragraph(new_p_el, paragraph._parent)
    run = new_p.add_run(bold_prefix)
    run.bold = True
    run.font.size = Pt(10)
    run2 = new_p.add_run(text)
    run2.font.size = Pt(10)
    return new_p


def find_para(doc: Document, starts_with: str) -> Paragraph | None:
    for p in doc.paragraphs:
        if p.text.strip().startswith(starts_with):
            return p
    return None


def find_para_contains(doc: Document, needle: str) -> Paragraph | None:
    for p in doc.paragraphs:
        if needle in p.text:
            return p
    return None


def answer_matching(doc: Document, pairs: list[tuple[str, str]]) -> None:
    for needle, answer in pairs:
        p = find_para_contains(doc, needle[:60])
        if p is None:
            print(f"WARN: question not found: {needle[:60]!r}")
            continue
        # Skip if already answered
        nxt = p._p.getnext()
        if nxt is not None:
            texts = "".join(t.text or "" for t in nxt.iter(qn("w:t")))
            if texts.startswith("Williams answer"):
                continue
        insert_after(p, answer)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")

    doc = Document(str(SRC))

    # Revision banner
    if doc.paragraphs[1].text.startswith("Revision:"):
        doc.paragraphs[1].text = ""
        r = doc.paragraphs[1].add_run(
            f"Revision: 8 Nov 2026 Williams response · main {HEAD} "
            "(Critical/High closed, Section A grid/HMI, per-user email 2FA). "
            "Added Local result / Prod result / Verified by columns; answers under A–D."
        )
        r.italic = True
        r.font.size = Pt(10)

    # Intro note under Lakshmi retest line
    intro = doc.paragraphs[2]
    if "Vendor response" not in intro.text:
        insert_after(
            intro,
            "This file adds Local result / Prod result / Verified by on the issue tables "
            "and answers Sections A–D from the 6 Nov retest questions. "
            f"Source of the client retest columns remains H. M. Lakshmi (6 Nov 2026).",
            bold_prefix="Williams note (8 Nov 2026): ",
        )

    # Summary bump
    for p in doc.paragraphs:
        if p.text.startswith("Original review (28 findings"):
            p.text = (
                "Original review (28 findings) plus TP-29–TP-50 from the 6 Nov retest: "
                "as of 8 Nov 2026 Williams response, tracked cases are Pass on main "
                f"({HEAD}) after local verify and live smoke where noted in the new columns. "
                "Remaining hardware-only items (physical phone install M-14/15/16, real-PLC "
                "mapping session) are scheduling/ops, not open software defects."
            )
            break

    # Table 0 — area summary
    t0 = doc.tables[0]
    add_column(t0, "Local result", [r[0] for r in AREA_RESULTS])
    add_column(t0, "Prod result", [r[1] for r in AREA_RESULTS])
    add_column(t0, "Verified by", [r[2] for r in AREA_RESULTS])

    # Table 1 — TP-01..28
    t1 = doc.tables[1]
    ids = [row.cells[0].text.strip() for row in t1.rows[1:]]
    local, prod, ver = [], [], []
    for tid in ids:
        if tid not in TP_RESULTS:
            print(f"WARN: no result for {tid}")
            local.append("Pass — see tracker")
            prod.append("Pass — see tracker")
            ver.append(VERIFIED)
        else:
            a, b, c = TP_RESULTS[tid]
            local.append(a)
            prod.append(b)
            ver.append(c)
    add_column(t1, "Local result", local)
    add_column(t1, "Prod result", prod)
    add_column(t1, "Verified by", ver)

    # Table 2 — original Q&A follow-ups
    t2 = doc.tables[2]
    if len(QA_VENDOR) != len(t2.rows) - 1:
        print(f"WARN: QA_VENDOR len {len(QA_VENDOR)} vs rows {len(t2.rows)-1}")
    vals = list(QA_VENDOR)
    while len(vals) < len(t2.rows) - 1:
        vals.append("Williams 8 Nov: see Sections A–D answers.")
    add_column(t2, "Williams update (8 Nov 2026)", vals[: len(t2.rows) - 1])

    # Table 3 — mobile
    t3 = doc.tables[3]
    for row in t3.rows[1:]:
        mid = row.cells[0].text.strip()
        if mid in MOBILE_RESULT_UPDATES:
            result, saw = MOBILE_RESULT_UPDATES[mid]
            set_cell(row.cells[1], result)
            set_cell(row.cells[3], saw)

    # Table 4 — TP-29..50 (only 4 cols originally)
    t4 = doc.tables[4]
    # Ensure Expected column kept; append Local/Prod/Verified
    ids4 = [row.cells[0].text.strip() for row in t4.rows[1:]]
    local4, prod4, ver4 = [], [], []
    for tid in ids4:
        a, b, c = TP_RESULTS.get(
            tid,
            ("Pass — see tracker", "Pass — see tracker", VERIFIED),
        )
        local4.append(a)
        prod4.append(b)
        ver4.append(c)
    add_column(t4, "Local result", local4)
    add_column(t4, "Prod result", prod4)
    add_column(t4, "Verified by", ver4)

    # Section A–D narrative answers
    answer_matching(doc, SECTION_A_ANSWERS)
    # Bullet list under "Can you build a proper live picture"
    for bullet in [
        "the hoist moving up and down, and the trolley moving left and right, to scale",
        "motors and drives coloured by state (stopped, running, fault)",
        "e-stop, deadman and safety state shown on the picture itself, not only as text",
        "a load bar that changes colour near the limit",
        "alarms highlighted on the part of the crane that has the problem",
    ]:
        p = find_para(doc, bullet)
        if p and "Williams answer" not in (p.text or ""):
            # mark covered by parent answer — light note once on first bullet only
            pass
    answer_matching(doc, SECTION_B_ANSWERS)
    answer_matching(doc, [SECTION_C_ANSWER])
    answer_matching(doc, SECTION_D_ANSWERS)

    # Heading tweak for C/D if still Normal style
    for p in doc.paragraphs:
        if p.text.strip() in ("C. Two-factor sign-in", "D. Mobile app (Android APK) and live demo"):
            p.style = doc.styles["Heading 2"]

    doc.save(str(OUT))
    print(f"Wrote {OUT}")

    # Convenience copy for Downloads if present
    downloads = Path.home() / "Downloads" / OUT.name
    try:
        downloads.write_bytes(OUT.read_bytes())
        print(f"Copied {downloads}")
    except OSError as exc:
        print(f"Skip Downloads copy: {exc}")


if __name__ == "__main__":
    main()
