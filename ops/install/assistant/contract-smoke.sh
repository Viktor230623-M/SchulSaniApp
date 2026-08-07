#!/usr/bin/env bash
set -euo pipefail

root="$(mktemp -d)"
state="$(mktemp)"
log="$(mktemp)"
providers="$(mktemp)"
cookie="$(mktemp)"
token="$(openssl rand -hex 16)"
port="${SCHULSANI_SMOKE_PORT:-45682}"
pid=""

cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  rm -rf "$root" "$state" "$log" "$providers" "$cookie"
}
trap cleanup EXIT

mkdir -p "$root/artifacts/api-server" "$root/artifacts/paramedic-app"

SCHULSANI_TOKEN="$token" \
SCHULSANI_PORT="$port" \
SCHULSANI_STATE_FILE="$state" \
SCHULSANI_LOG_FILE="$log" \
SCHULSANI_APP_ROOT="$root" \
SCHULSANI_DATABASE_URL="postgres://unused" \
SCHULSANI_AUTH_PROVIDERS_PATH="$providers" \
node "$(dirname "$0")/server.js" >/dev/null 2>&1 &
pid=$!

for _ in $(seq 1 50); do
  if curl -sS "http://127.0.0.1:$port/setup/$token" -c "$cookie" -o /dev/null -w '%{http_code}' 2>/dev/null | grep -q 302; then
    break
  fi
  sleep 0.1
done

node - "$cookie" "$port" <<'NODE'
const fs = require("node:fs");
const cookiePath = process.argv[2];
const port = process.argv[3];
const body = {
  authMode: "local+oidc",
  schoolName: "Beispielschule",
  domain: "sani.example.test",
  providerKey: "google",
  providerDisplayName: "Google",
  providerIssuerUrl: "https://accounts.google.com",
  providerClientId: "google-id",
  providerClientSecret: `google-${process.pid}-${Date.now()}`,
  providerScopes: "openid email profile calendar.readonly",
  providerAllowedHostedDomains: "example.test",
  providerGroupsClaim: "groups",
  providerGroupToRoleMap: "sanis=sanitaeter",
  providerClientSecretMode: "static",
  providerResponseMode: "query",
  provider2Key: "microsoft",
  provider2DisplayName: "Microsoft",
  provider2IssuerUrl: "https://login.microsoftonline.com/tenant/v2.0",
  provider2ClientId: "microsoft-id",
  provider2ClientSecret: `microsoft-${process.pid}-${Date.now()}`,
  provider2Scopes: "openid email profile",
  provider2GroupsClaim: "roles",
  provider2GroupToRoleMap: "leaders=sanitaeter_leitung",
  provider2ClientSecretMode: "static",
  provider2ResponseMode: "query",
  smtpHost: "mail.example.test",
  smtpPort: "587",
  smtpUser: "mailer@example.test",
  smtpPassword: `smtp-${process.pid}-${Date.now()}`,
  smtpSecure: "false",
  mailFrom: "noreply@example.test",
  mailFromName: "SchulSani",
  appName: "SchulSani",
  themeColor: "#22C55E",
  bundleId: "com.example.sani",
  schoolId: "example",
  ownerUserId: "owner",
  vapidSubject: "mailto:admin@example.test",
};
const cookie = fs.readFileSync(cookiePath, "utf8").split("\n").find((line) => line.includes("schulsani_setup"))?.split("\t").pop();
if (!cookie) throw new Error("Setup-Sitzung konnte nicht angelegt werden.");
const headers = { "content-type": "application/json", cookie: `schulsani_setup=${cookie}` };
const post = async (pathname, payload) => {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`${pathname} antwortet mit ${response.status}`);
};
(async () => {
  await post("/api/config", body);
  await post("/api/secrets", {});
})().catch((error) => { console.error(error.message); process.exit(1); });
NODE

node - "$providers" "$root/artifacts/api-server/.env" <<'NODE'
const fs = require("node:fs");
const providers = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (providers.length !== 3) throw new Error("Erwartet: lokaler Weg und zwei OIDC-Anbieter.");
const [local, google, microsoft] = providers;
if (local.type !== "local" || google.key !== "google" || microsoft.key !== "microsoft") throw new Error("Anbieterstruktur ungueltig.");
if (google.scopes.length !== 4 || google.groupToRoleMap.sanis !== "sanitaeter") throw new Error("Google-Optionen fehlen.");
if (microsoft.scopes.length !== 3 || microsoft.groupToRoleMap.leaders !== "sanitaeter_leitung") throw new Error("Microsoft-Optionen fehlen.");
const env = fs.readFileSync(process.argv[3], "utf8");
for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_REQUIRE_TLS", "MAIL_FROM", "APP_BASE_URL"]) {
  if (!env.includes(`${key}=`)) throw new Error(`${key} fehlt in Backend-.env.`);
}
console.log("Installer-Vertrag: ok");
NODE
