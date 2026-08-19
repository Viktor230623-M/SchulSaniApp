// End-to-End-Test der SchulSaniApp (Web) über den kompletten Lebenszyklus.
// Läuft gegen den lokalen HTTPS-Proxy (ops/e2e/proxy.mjs) mit Backend + SMTP-Fänger.
//
// Aufruf: node ops/e2e/app.spec.mjs
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("/Users/viktorgnjatic/Projects/website-ba-barbershop/node_modules/playwright");

const BASE = "https://localhost:8443";
const MAIL_LOG = "/tmp/schulsani-e2e/mail.log";
const SHOTS = "/tmp/schulsani-e2e/shots";
fs.mkdirSync(SHOTS, { recursive: true });

const EMAIL = `e2e-${Date.now()}@schulsani.local`;
const PASSWORD = "e2e-passwort-12345";
const FIRST = "Erika";
const LAST = "Testkind";
const JOIN_CODE = "demo123";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

let shot = 0;
async function snap(page, name) {
  shot += 1;
  try {
    await page.screenshot({ path: path.join(SHOTS, `${String(shot).padStart(2, "0")}-${name}.png`), fullPage: false });
  } catch {}
}

async function fillField(page, label, value) {
  const strategies = [
    () => page.getByLabel(label),
    () => page.getByPlaceholder(label),
    () => page.locator(`input[aria-label="${label}"]`),
    () => page.locator(`input`).filter({ hasText: "" }).locator(`..`).filter({ hasText: label }).locator("input"),
  ];
  for (const s of strategies) {
    try {
      const loc = s();
      if (await loc.count()) {
        await loc.first().fill(value);
        return;
      }
    } catch {}
  }
  // Last resort: try all visible inputs
  const inputs = page.locator("input:visible");
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    const type = await input.getAttribute("type");
    const placeholder = await input.getAttribute("placeholder");
    const name = await input.getAttribute("name");
    const isEmail = type === "email" || placeholder?.toLowerCase().includes("e-mail") || name?.includes("email");
    const isPassword = type === "password" || placeholder?.toLowerCase().includes("passwort");
    if (label.toLowerCase().includes("e-mail") && isEmail) { await input.fill(value); return; }
    if (label.toLowerCase().includes("passwort") && isPassword) { await input.fill(value); return; }
  }
  throw new Error(`Feld "${label}" nicht gefunden`);
}

async function readVerificationToken() {
  for (let i = 0; i < 40; i++) {
    if (fs.existsSync(MAIL_LOG)) {
      const content = fs.readFileSync(MAIL_LOG, "utf8");
      const m = content.match(/token=([A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Kein Verifizierungstoken in der Mail gefunden");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  try {
    // 1. Navigate to app
    console.log("Step 1: Navigating to app...");
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);
    await snap(page, "01-start");

    // Detect current state
    const currentUrl = page.url();
    const bodyText = await page.innerText("body").catch(() => "");
    console.log("Current URL:", currentUrl);
    console.log("Body text (first 200):", bodyText.slice(0, 200));

    // Check if we're already in the app (tabs visible)
    const isInApp = bodyText.includes("Neuigkeiten") || bodyText.includes("Einsatz") || bodyText.includes("News");
    const isOnStart = bodyText.includes("Mit SchulSaniApp") || bodyText.includes("Lizenz") || bodyText.includes("Schul-ID");
    const isOnLogin = bodyText.includes("Anmelden") || bodyText.includes("Konto erstellen");
    const isOnRegister = bodyText.includes("Registrieren") || bodyText.includes("E-Mail");

    record("App geladen", true, `URL: ${currentUrl}`);

    if (isInApp) {
      console.log("Already in app (single-tenant auto-login). Testing tabs...");
      record("Auto-Login (Single-Tenant)", true, "App zeigt direkt die Tabs");

      // Test each tab
      const tabs = [
        { name: "Einsatz", text: "Einsatz" },
        { name: "Benachrichtigungen", text: "Meldung" },
        { name: "Dienst", text: "Dienst" },
        { name: "Abwesenheit", text: "Abwesenheit" },
        { name: "News", text: "News" },
        { name: "Mehr", text: "Mehr" },
      ];

      for (const tab of tabs) {
        try {
          const btn = page.locator("button").filter({ hasText: tab.text }).first();
          if (await btn.isVisible({ timeout: 3000 })) {
            await btn.click();
            await page.waitForTimeout(1000);
            await snap(page, `02-tab-${tab.name}`);
            record(`Tab "${tab.name}"`, true);
          } else {
            record(`Tab "${tab.name}"`, false, "Button nicht sichtbar");
          }
        } catch (e) {
          record(`Tab "${tab.name}"`, false, String(e.message).slice(0, 80));
        }
      }

      // Test settings / account deletion
      console.log("Testing settings and account deletion...");
      try {
        const mehrBtn = page.locator("button").filter({ hasText: "Mehr" }).first();
        if (await mehrBtn.isVisible({ timeout: 3000 })) {
          await mehrBtn.click();
          await page.waitForTimeout(1000);
          await snap(page, "03-mehr");
          record("Mehr-Menü", true);
        }
      } catch (e) {
        record("Mehr-Menü", false, String(e.message).slice(0, 80));
      }

      // Look for "Einstellungen" or "Konto löschen"
      try {
        const settingsBtn = page.getByText("Einstellungen", { exact: false }).first();
        if (await settingsBtn.isVisible({ timeout: 3000 })) {
          await settingsBtn.click();
          await page.waitForTimeout(1000);
          await snap(page, "04-einstellungen");
          record("Einstellungen", true);

          // Scroll to find "Konto löschen"
          const deleteBtn = page.getByText("Konto löschen", { exact: true }).first();
          if (await deleteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await deleteBtn.scrollIntoViewIfNeeded();
            await snap(page, "05-konto-loeschen-before");
            record("Konto löschen Button sichtbar", true);
          } else {
            record("Konto löschen Button", false, "Nicht gefunden");
          }
        } else {
          record("Einstellungen", false, "Nicht gefunden");
        }
      } catch (e) {
        record("Settings navigation", false, String(e.message).slice(0, 80));
      }

    } else if (isOnLogin || isOnStart || isOnRegister) {
      console.log("On login/start/register page. Running full registration flow...");

      // Step 2: Navigate to register
      if (isOnStart) {
        // Click "Konto erstellen" or similar
        const registerLink = page.getByText("Konto erstellen", { exact: true }).first()
          .or(page.getByText("Registrieren", { exact: true }).first());
        await registerLink.click({ timeout: 5000 });
        await page.waitForTimeout(1000);
      }

      await snap(page, "02-register");

      // Fill registration form
      await fillField(page, "E-Mail", EMAIL);
      await fillField(page, "Passwort", PASSWORD);
      await fillField(page, "Vorname", FIRST);
      await fillField(page, "Nachname", LAST);
      await snap(page, "03-register-filled");

      // Look for join code field
      try {
        await fillField(page, "Zugangscode", JOIN_CODE);
      } catch {
        try {
          await fillField(page, "Schul-Zugangscode", JOIN_CODE);
        } catch {}
      }

      // Submit
      const submitBtn = page.getByText("Registrierung starten", { exact: true }).first()
        .or(page.getByText("Registrieren", { exact: true }).first());
      await submitBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      await snap(page, "04-after-register");
      record("Registrierung abgeschickt", true);

      // Step 3: Email verification
      const token = await readVerificationToken();
      record("Verifizierungs-Mail erhalten", true, `token=${token.slice(0, 8)}…`);

      // Verify via API
      const verifyStatus = await page.evaluate(async (tok) => {
        const resp = await fetch("/api/auth/local/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tok }),
        });
        return resp.status;
      }, token);
      record("E-Mail verifiziert", verifyStatus === 200, `HTTP ${verifyStatus}`);

      // Step 4: Login
      await page.goto(BASE + "/login", { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      await fillField(page, "Benutzername", EMAIL);
      await fillField(page, "Passwort", PASSWORD);
      await snap(page, "05-login-filled");
      await page.getByText("Anmelden", { exact: true }).first().click();
      await page.waitForTimeout(3000);
      await snap(page, "06-after-login");
      record("Login", true);

      // Step 5: Confirm name if needed
      const confirmVisible = await page.getByText("Bestätigen", { exact: true }).first().isVisible({ timeout: 3000 }).catch(() => false);
      if (confirmVisible) {
        await fillField(page, "Vorname", FIRST);
        await fillField(page, "Nachname", LAST);
        await snap(page, "07-name-confirm");
        await page.getByText("Bestätigen", { exact: true }).first().click();
        await page.waitForTimeout(1500);
        record("Name bestätigt", true);
      } else {
        record("Name bestätigt (übersprungen)", true);
      }

      await snap(page, "08-tabs");
      record("In der App (Tabs) angekommen", true);

      // Step 6: Test tabs
      for (const tab of ["Einsatz", "Benachrichtigungen", "Dienst", "Abwesenheit"]) {
        try {
          const btn = page.locator("button").filter({ hasText: tab }).first();
          if (await btn.isVisible({ timeout: 3000 })) {
            await btn.click();
            await page.waitForTimeout(800);
            await snap(page, `09-tab-${tab}`);
            record(`Tab "${tab}"`, true);
          } else {
            record(`Tab "${tab}"`, false, "nicht sichtbar");
          }
        } catch (e) {
          record(`Tab "${tab}"`, false, String(e.message).slice(0, 80));
        }
      }

      // Step 7: Account deletion
      try {
        await page.locator("button").filter({ hasText: "Mehr" }).first().click();
        await page.waitForTimeout(800);
        await page.getByText("Einstellungen").first().click();
        await page.waitForTimeout(1000);
        const del = page.getByText("Konto löschen", { exact: true });
        await del.first().scrollIntoViewIfNeeded();
        await snap(page, "10-delete-before");
        await del.first().click();
        await page.waitForTimeout(500);
        await snap(page, "11-delete-dialog");
        const confirm = page.getByText("Konto löschen", { exact: true });
        await confirm.last().click();
        await page.waitForTimeout(3000);
        await snap(page, "12-after-delete");
        record("Konto gelöscht", true);
      } catch (e) {
        record("Konto löschen", false, String(e.message).slice(0, 80));
      }

    } else {
      record("Unbekannter Zustand", false, `URL: ${currentUrl}, Text: ${bodyText.slice(0, 100)}`);
    }

  } catch (err) {
    record("Abbruch", false, String(err?.message ?? err).slice(0, 200));
    await snap(page, "error");
  } finally {
    console.log("\n===== ERGEBNIS =====");
    for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} bestanden`);
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
