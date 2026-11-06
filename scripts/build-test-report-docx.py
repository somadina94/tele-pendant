#!/usr/bin/env python3
"""Generate TelePendant_Test_Report.docx (gitignored)."""

from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "TelePendant_Test_Report.docx"

ISSUES = [
    (
        "TP-01",
        "Critical",
        "Operator",
        'STOP refused when PIN empty ("SAFE_ACTION_PIN does not match").',
        "STOP works with one press; PIN only for reset.",
        "Fixed (present): STOP cell activates with one press and no PIN. Reset PIN field is only for Reset e-stop after a stop. Documented in USER_MANUAL and PLAIN_LANGUAGE_GUIDE.",
    ),
    (
        "TP-02",
        "High",
        "Operator",
        "Demo SAFE_ACTION_PIN same as admin password; tour reveals PIN source.",
        "Production PIN separate from login; no hints on screen.",
        "Partial (present): Login password is separate from SAFE_ACTION_PIN in code and docs; demo .env may still use the same string for both. Admins change login passwords via Account menu; plant reset PIN stays env-only. Tour text describes reset-only use, not the literal PIN value.",
    ),
    (
        "TP-03",
        "Critical",
        "Operator",
        "Pointer slid off button while held; motion continued.",
        "Motion stops when pointer leaves the button.",
        "Fixed (present): pointermove + pointer leave ends the hold and releases the coil (web OperatorPage; mobile parity).",
    ),
    (
        "TP-04",
        "Critical",
        "Operator",
        "Tab hidden; hoist kept running in background.",
        "Motion stops on background / app switch.",
        "Fixed (present): visibilitychange and pagehide drop active holds and release motion coils (web; mobile uses AppState).",
    ),
    (
        "TP-05",
        "Critical",
        "Operator",
        "50-75 mm overrun after release; HOLD/RUN linger ~300 ms.",
        "Immediate stop and status update.",
        "Partial (present): UI clears deadman/HOLD immediately on release; simulator/PLC may still coast one poll cycle. Expect tighter behaviour on real hardware with wired deadman.",
    ),
    (
        "TP-06",
        "Critical",
        "Media",
        "UP/DOWN ran ~2 s on single tap without hold.",
        "Hold-to-run or feature off in Config.",
        "Fixed (present): Media no longer has UP/DOWN tap buttons. Allow timed media motion (checkbox in Config, Safety roles section) defaults off; voice up/down runs ~2 s only when that box is checked and you save safety roles. Voice stop still works without PIN.",
    ),
    (
        "TP-07",
        "Critical",
        "Config",
        "Delete with no confirmation; STOP cell deletable.",
        "Confirm deletes; protect STOP.",
        "Fixed (present): delete confirmation dialog; STOP/e-stop cells cannot be deleted (AdminPage guard).",
    ),
    (
        "TP-08",
        "High",
        "Operator",
        'Sticky "Motion blocked" banner until reload.',
        "Banner clears when condition clears.",
        "Fixed (present): message auto-clears when safety returns to normal and e-stop is inactive.",
    ),
    (
        "TP-09",
        "High",
        "Ops",
        "Shelved E-Stop alarm stuck while safety normal.",
        "Unshelve + clear when condition clears.",
        "Fixed (present): Unshelve on Ops; shelved alarms clear when the underlying condition recovers (alarm engine + tests).",
    ),
    (
        "TP-10",
        "High",
        "Audit",
        "Alarm CRUD not logged; missing user names; raw IDs.",
        "Full audit with readable names.",
        "Fixed (present): alarm.create/update/delete/shelve/unshelve audited; cell.activate uses display names; user admin actions logged. Audit supports filters and CSV export on web.",
    ),
    (
        "TP-11",
        "High",
        "Security",
        "No X-Frame-Options / CSP; Operator embeddable.",
        "Frame denial headers on web.",
        "Fixed (present): web dev server and nginx config send X-Frame-Options DENY and CSP frame-ancestors 'none' (INSTALLATION.md).",
    ),
    (
        "TP-12",
        "High",
        "API",
        "Public Swagger on live; default localhost server.",
        "Protected or off in production.",
        "Fixed (present): Swagger not mounted when NODE_ENV=production; local/dev still exposes Swagger for integrators.",
    ),
    (
        "TP-13",
        "High",
        "API",
        "OTA manifest pointed at localhost bundle URL.",
        "HTTPS production URL.",
        "Fixed (present): apps/api/ota/manifest.json launchAsset.url uses https://api.tele-pendant.jahbyte.com/ota/assets/bundle.js.",
    ),
    (
        "TP-14",
        "High",
        "Config",
        "Add PLC had Use this PLC on by default.",
        "Off by default; confirm switch.",
        "Fixed (present): new PLC form defaults enabled=false; enabling Use this PLC prompts Use this PLC now? confirmation.",
    ),
    (
        "TP-15",
        "Medium",
        "Operator",
        "No trolley feedback/status on L/R cells.",
        "Position/run feedback visible.",
        "Open (present): demo seed still maps trolley coils only; integrators bind feedback/status registers in Config (by design for demo).",
    ),
    (
        "TP-16",
        "Medium",
        "Media",
        "BarcodeDetector missing; no scan on Safari/desktop.",
        "QR fallback on all targets.",
        "Fixed (present): ZXing JS fallback when BarcodeDetector is unavailable (MediaPage + tests).",
    ),
    (
        "TP-17",
        "Medium",
        "Media / Face",
        "Camera permission denied with no retry.",
        "Retry / allow camera affordance.",
        "Improved (present): CameraAccessAlert component guides retry; behaviour depends on browser permission UX.",
    ),
    (
        "TP-18",
        "Medium",
        "Media",
        "Listen ends silently.",
        "Always show heard / nothing heard / mic error.",
        "Improved (present): voice log line updated on result, error, and end events; verify on target browser during re-test.",
    ),
    (
        "TP-19",
        "Medium",
        "Face",
        "Face page without sidebar when logged in.",
        "Same shell as other pages.",
        "Open (present): /face still uses FaceEntry layout (enroll/login flow), not AppShell; intentional for challenge UI. Logged-in users reach other screens via sidebar routes.",
    ),
    (
        "TP-20",
        "Medium",
        "Ops",
        "Unlabelled trend / slow first sample.",
        "Labelled charts; data from first poll.",
        "Partial (present): trends tied to Config Trend flags; first samples still depend on poller interval; wait a few seconds on cold start.",
    ),
    (
        "TP-21",
        "Medium",
        "Config",
        "Raw UUID labels; free-text severity; no alarm edit.",
        "Readable labels, severity control, edit alarms.",
        "Fixed (present): register names in pickers; alarm edit/update on Config; severity is a dropdown (info, warning, critical) on web and mobile, not free text; API accepts only those levels; legacy values normalize on save/display.",
    ),
    (
        "TP-22",
        "Medium",
        "Media",
        "Empty Resolve sent to API.",
        "Block empty code client-side.",
        "Fixed (present): Resolve disabled when manual code field is empty.",
    ),
    (
        "TP-23",
        "Low",
        "Theme",
        "STOP pale pink in dark mode.",
        "Strong red in both themes.",
        "Fixed (present): estop matrix styling uses dedicated .estop / .estop-mark tokens in light and dark (index.css).",
    ),
    (
        "TP-24",
        "Low",
        "Tour",
        "Tour covers controls; double Done.",
        "Visible highlight; single Done.",
        "Partial (present): tour still overlay-based; re-check steps 4/6 on 375px after layout updates.",
    ),
    (
        "TP-25",
        "Low",
        "Phone layout",
        "375px inner scroll on matrix; small Audit table.",
        "Full matrix visible; readable Audit.",
        "Improved (present): horizontal Reset PIN row on desktop; operator waits for data before matrix (less flash). Audit horizontal scroll may remain; re-test at 375px.",
    ),
    (
        "TP-26",
        "Low",
        "Text",
        "Operator sees .env / CURSOR_API_KEY strings.",
        "Operator-facing copy only.",
        "Improved (present): assistant and config copy trimmed for operators; some integrator hints remain on Config for admins.",
    ),
    (
        "TP-27",
        "Low",
        "Operator",
        'Readout "DRIVE"; dashes on load.',
        '"Motor"; last value while loading.',
        "Fixed (present): cluster label Motor; operator screen stays in loading until layout/tags ready (or 2.5s fallback) before showing matrix.",
    ),
    (
        "TP-28",
        "Low",
        "Docs",
        "Guide vs test plan language list mismatch; STOP style naming.",
        "Docs match app.",
        "Fixed (present): manuals updated Nov 2026 (en/es/fr/de, Users, change password, migrations, operator ready state; commit fcba436 on main).",
    ),
]

TEST_AREAS = [
    (
        "API health / Swagger / OTA manifest",
        "Health OK, Swagger loads, manifest runtimeVersion 0.0.1",
        "Pass with issues (TP-12, TP-13)",
        "Pass on production API health + OTA HTTPS URL; Swagger only in non-production NODE_ENV.",
    ),
    (
        "Operator: Hoist Up / Down hold",
        "Height changes, deadman HOLD + RUN",
        "Pass with issues (TP-03 to TP-05, TP-08)",
        "Pass: hold/release, pointer-leave and tab-hide release; loading gate until tags ready.",
    ),
    (
        "Operator: Trolley L / R",
        "Deadman HOLD, no error",
        "Pass, no feedback (TP-15)",
        "Unchanged demo mapping; still no trolley feedback unless configured.",
    ),
    (
        "Operator: STOP",
        "Previously failed without PIN",
        "Design issue (TP-01, TP-02)",
        "Pass: one-press STOP; PIN row for reset only.",
    ),
    (
        "Media: Resolve / voice / QR",
        "Mixed partial",
        "Partial (TP-06, TP-16 to TP-18, TP-22)",
        "Pass with config: timed motion off by default; ZXing fallback; empty resolve blocked.",
    ),
    (
        "Config: Users / passwords",
        "Not in original round",
        "N/A",
        "Pass (new): admin Users CRUD + suspend; all roles Change password (web Account menu, phone drawer).",
    ),
    (
        "Ops / Audit / Assistant",
        "Working with gaps",
        "Pass with issues (TP-09, TP-10, TP-20)",
        "Pass: unshelve; alarm audit; FTS assistant without Cursor key.",
    ),
    (
        "Documents (GitHub)",
        "Compared to app",
        "Pass with issues (TP-28)",
        "Pass: USER_MANUAL, MANUAL_TEST_PLAN, PLAIN_LANGUAGE_GUIDE aligned Nov 2026.",
    ),
]

QA = [
    (
        "Safety and control",
        "The guide said STOP without PIN was intentional. Can STOP be one press with PIN only for reset?",
        "Yes; that is the present behaviour. STOP is one press; SAFE_ACTION_PIN is only for Reset e-stop (API hmi.service + UI). Docs and training were updated accordingly.",
    ),
    (
        "Safety and control",
        "How does software e-stop clear on a real plant without restarting the simulator?",
        "Present flow: press STOP once (latches e-stop), then enter the plant Reset PIN and click Reset e-stop when the hardwired chain allows. REAL_PLC_WIRING still requires a hardware e-stop; software does not replace SIL.",
    ),
    (
        "Safety and control",
        'What happens when an operator says "stop" on Media?',
        "Allowlisted stop commands the safety stop without PIN (same as STOP cell intent). Saying up or down runs timed hoist only when Allow timed media motion is checked under Config, Safety roles, then saved; otherwise use hold-to-run on Operator.",
    ),
    (
        "Safety and control",
        "Wi-Fi loss mid-hold: how fast does motion stop?",
        "Present: deadman release and visibility/background handlers drop coils from the pendant; PLC should still enforce its own deadman/heartbeat; tune timeouts in the PLC program per REAL_PLC_WIRING.md (not fixed numbers in app).",
    ),
    (
        "Safety and control",
        "Pointer leave and background (TP-03, TP-04)?",
        "Implemented on web and mobile as of operator-ready release (main 43027a2+).",
    ),
    (
        "Safety and control",
        "Post-release overrun: simulator or PLC?",
        "UI deadman clears immediately; remaining travel is largely simulator/poll latency (TP-05 partial). Re-measure on target PLC.",
    ),
    (
        "Safety and control",
        "Disable Media UP/DOWN one-tap motion?",
        "Present: there are no UP/DOWN tap buttons on Media (web or phone). Timed hoist from voice is gated by Allow timed media motion, a checkbox at the bottom of Config, Safety roles (default off). Check it, click Save safety roles, then use Listen and say up or down.",
    ),
    (
        "Safety and control",
        "Per-operator PIN instead of shared SAFE_ACTION_PIN?",
        "Not implemented; reset remains one plant-wide SAFE_ACTION_PIN in .env. Login passwords are per-user (change password + admin reset on Users).",
    ),
    (
        "Safety and control",
        "Only one PLC enabled at a time?",
        "Present: saving a connection with Use this PLC confirms and disables others (single active connection in service).",
    ),
    (
        "Functional",
        "Missing trolley feedback intentional?",
        "Yes for demo seed; map feedback/status registers in Config for production trolleys.",
    ),
    (
        "Functional",
        "Alarms clear / unshelve?",
        "Present: Ack, Shelve, Unshelve on Ops; condition recovery clears events; USER_MANUAL section 11.",
    ),
    (
        "Functional",
        "Sticky Motion blocked banner?",
        "Auto-clears when safety is normal (TP-08 fix). If it persists, check e-stop state and reload only as last resort.",
    ),
    (
        "Functional",
        "JS QR fallback?",
        "Yes; ZXing when BarcodeDetector missing (TP-16).",
    ),
    (
        "Mobile / handover",
        "iOS build vs web-only?",
        "Present: native iOS IPA is built from this repo on macOS (pnpm handover:mobile:ios). Signed IPA and Apple signing files are delivered at handover over a secure channel, not in git. Until then, iPhone operators can use the web HMI in Safari. Apple Developer setup is listed in the section iOS native build: Apple Developer account in this report and in docs/MOBILE_RELEASE.md.",
    ),
    (
        "Mobile / handover",
        "What is needed from the Apple Developer account?",
        "Enrolled Apple Developer Program team (Team ID for APPLE_TEAM_ID); App ID / bundle ID com.telependant.app; Apple Distribution certificate exported as .p12; provisioning profile (.mobileprovision) for that bundle ID. For default Ad Hoc installs, register each test device UDID on the team and use an Ad Hoc profile (IOS_EXPORT_METHOD=ad-hoc). For App Store or TestFlight use App Store Connect plus an App Store distribution profile (IOS_EXPORT_METHOD=app-store). Import cert and profile on the Mac that runs Xcode; fill apps/mobile/signing/credentials.env; run pnpm handover:mobile:ios. Camera and speech capabilities should match the app (Face, QR, Listen). Nothing from Apple is stored in git.",
    ),
    (
        "Mobile / handover",
        "Operator and Supervisor demo logins?",
        "Present: admins create operator/supervisor users in Config Users (or Account menu shortcuts). No fixed second seed besides admin@example.com.",
    ),
    (
        "Mobile / handover",
        "Two phones same crane: lockout?",
        "Not implemented; last write wins on shared PLC; operational procedure should avoid dual control.",
    ),
    (
        "Mobile / handover",
        "Handover: .env, Docker, backup, reset without sim restart?",
        "See INSTALLATION.md, MAINTENANCE.md, MOBILE_RELEASE.md, USER_MANUAL section 11: reset via PIN; signed mobile builds and signing keys sent securely, not in repo; pnpm handover:mobile rebuilds Android/iOS when keys are on the build machine.",
    ),
    (
        "Mobile / handover",
        "Swagger off, headers, OTA URL before our server?",
        "Present in codebase: production Swagger off, web security headers documented, OTA HTTPS URL in manifest; redeploy API/web containers to pick up on live.",
    ),
    (
        "Mobile / handover",
        "Audit filter/export/retention?",
        "Present: Audit page date/user filters, pagination, and Export CSV (web); mobile audit list; SQLite retention is indefinite until ops backup/purge policy.",
    ),
]

IOS_APPLE_HANDOVER = [
    "Purpose: produce tele-pendant-release.ipa (pnpm handover:mobile:ios on macOS). Output path apps/mobile/dist/; bundle ID com.telependant.app.",
    "Apple Developer Program: active membership on the team that will own signing and (if used) App Store Connect. Note the Team ID (10 characters) from Membership details; set APPLE_TEAM_ID in apps/mobile/signing/credentials.env.",
    "Identifiers: register an App ID for com.telependant.app in Certificates, Identifiers and Profiles. Enable services the native app uses (Camera for QR/Face; Speech if using Listen on device).",
    "Distribution certificate: create an Apple Distribution certificate for the team, download, export from Keychain Access as signing/ios/*.p12 with a strong password (share password only over a secure channel with the .p12).",
    "Provisioning profile: create a distribution profile bound to com.telependant.app and the distribution certificate. Ad Hoc (default): add every iPhone/iPad UDID that will install the IPA, download .mobileprovision to signing/ios/. App Store: create the app record in App Store Connect, use an App Store profile for upload or TestFlight.",
    "Build machine: macOS with Xcode installed; Apple ID added in Xcode Settings, Accounts; import .p12 into the login keychain; install .mobileprovision (double-click or drag into Xcode). Optional: IOS_PROVISIONING_PROFILE_NAME if using manual signing; IOS_EXPORT_METHOD ad-hoc, app-store, or enterprise.",
    "Rebuild command: from repo root, pnpm handover:mobile:ios (or pnpm handover:mobile for APK, AAB, and IPA). Signing zip for transfer: pnpm handover:mobile:signing-zip (gitignored).",
    "Not in git: .p12, .mobileprovision, passwords, signed IPA. Web fallback: Safari at the production HMI URL until a signed IPA is installed.",
]


def set_cell(cell, text: str, bold: bool = False) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    run = p.add_run(text)
    run.font.size = Pt(9)
    if bold:
        run.bold = True


def main() -> None:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(10)

    title = doc.add_heading("Tele-Pendant test report (updated)", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = sub.add_run(
        "Revision: November 2026 · Reflects main branch through fcba436 "
        "(operator ready loading, user admin, docs sync, safety UX fixes)"
    )
    r.italic = True
    r.font.size = Pt(10)

    doc.add_heading("Summary", level=1)
    doc.add_paragraph(
        "The main operator flow works: hoist moves while held, live readouts update, "
        "configuration reaches Operator after layout/tags are ready, and Assistant, Ops, "
        "and Audit load correctly."
    )
    doc.add_paragraph(
        "Original review (28 findings: 6 Critical, 8 High, 8 Medium, 6 Low): "
        "as of this revision, 20 are resolved or materially improved in software, "
        "5 remain partial or environment-dependent (demo PIN string, simulator coast, "
        "trends cold start, tour overlay, 375px Audit scroll), and 3 are open by design "
        "(trolley demo mapping, FaceEntry layout, no dual-pendant lockout)."
    )
    doc.add_paragraph(
        "New since the first report: Config Users (suspend/edit/remove), change password "
        "for all roles, operator loading gate, horizontal Reset PIN row, migration "
        "AddUserSuspended, and aligned manuals."
    )

    doc.add_heading("What I tested", level=1)
    t1 = doc.add_table(rows=1, cols=4)
    t1.style = "Table Grid"
    hdr = t1.rows[0].cells
    for i, label in enumerate(
        ["Area", "What I checked (original)", "Original result", "Current success state"]
    ):
        set_cell(hdr[i], label, bold=True)
    for row in TEST_AREAS:
        cells = t1.add_row().cells
        for i, val in enumerate(row):
            set_cell(cells[i], val)

    doc.add_heading("Issues found (original + current state)", level=1)
    doc.add_paragraph(
        "Sixth column documents fixes shipped on main and what to expect on re-test today."
    )
    t2 = doc.add_table(rows=1, cols=6)
    t2.style = "Table Grid"
    h2 = t2.rows[0].cells
    for i, label in enumerate(
        [
            "ID",
            "Severity",
            "Area",
            "What I saw (original)",
            "Expected",
            "Fix / current success state",
        ]
    ):
        set_cell(h2[i], label, bold=True)
    for issue in ISSUES:
        cells = t2.add_row().cells
        for i, val in enumerate(issue):
            set_cell(cells[i], val)

    doc.add_page_break()
    doc.add_heading("Not tested yet (carry forward)", level=1)
    for item in [
        "Full e-stop regression on production after redeploy (rows 25-29 in MANUAL_TEST_PLAN.md); now documented; execute on live.",
        "Face enroll/login on hardware with camera allowed (rows 23-24).",
        "Signed Android APK and iOS IPA on physical devices after vendor secure delivery; iOS requires Apple Team ID, distribution .p12, Ad Hoc profile with device UDIDs, and macOS/Xcode (see iOS native build section); rebuild via pnpm handover:mobile.",
        "Background CSS + Safety roles save (row 19, 35); low risk; optional smoke.",
        "End-to-end with real Modbus PLC (REAL_PLC_WIRING.md).",
        "Re-run 375px Audit/layout pass after horizontal PIN row change.",
    ]:
        doc.add_paragraph(item, style="List Bullet")

    doc.add_heading("Questions for the session: answers (present state)", level=1)
    doc.add_paragraph(
        "Answers reflect the codebase and docs on main as of November 2026; "
        "note where live host must be redeployed to match."
    )
    t3 = doc.add_table(rows=1, cols=3)
    t3.style = "Table Grid"
    h3 = t3.rows[0].cells
    set_cell(h3[0], "Topic", bold=True)
    set_cell(h3[1], "Question (from original report)", bold=True)
    set_cell(h3[2], "Answer now", bold=True)
    for topic, q, a in QA:
        cells = t3.add_row().cells
        set_cell(cells[0], topic)
        set_cell(cells[1], q)
        set_cell(cells[2], a)

    doc.add_page_break()
    doc.add_heading("iOS native build: Apple Developer account", level=1)
    doc.add_paragraph(
        "Android signing uses a release keystore (TELE_PENDANT_ANDROID_*). "
        "iOS signing uses Apple-issued certificate and profile material from the "
        "customer or vendor Apple Developer team. The checklist below is what "
        "must exist before pnpm handover:mobile:ios can produce an installable IPA."
    )
    for item in IOS_APPLE_HANDOVER:
        doc.add_paragraph(item, style="List Bullet")

    doc.add_paragraph()
    p = doc.add_paragraph()
    p.add_run("Test report severity key: ").bold = True
    p.add_run(
        "Critical = safe stopping or motion; High = wrong state, security or audit; "
        "Medium = feature usability; Low = layout or wording."
    )
    p = doc.add_paragraph()
    p.add_run("Alarm severity (Config / Ops): ").bold = True
    p.add_run(
        "Integrators pick one of info, warning, or critical per alarm definition "
        "(dropdown on web and mobile Config). Ops shows the chosen level in brackets; "
        "not custom text."
    )

    doc.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
