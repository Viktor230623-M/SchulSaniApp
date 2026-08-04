import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const hier = dirname(fileURLToPath(import.meta.url));

// Nur fuer den Testlauf, nicht fuer Build oder echten Betrieb. Bereits
// gesetzte Werte bleiben unangetastet.
const testUmgebung: Record<string, string> = {
  ALLOWED_ORIGINS: "https://vitest.beispiel.invalid",
  ISERV_BASE_URL: "https://iserv.vitest.beispiel.invalid",
  EMAIL_DOMAIN: "vitest.beispiel.invalid",
  APP_NAME: "SchulSaniApp (Testlauf)",
  JWT_SECRET: "vitest-testschluessel-nicht-fuer-den-echten-betrieb-geeignet",
  DATABASE_URL: "postgres://vitest:vitest@127.0.0.1:1/vitest_nicht_erreichbar",
  AUTH_PROVIDERS_PATH: resolve(hier, "../../ops/install/auth-providers.example.json"),
};

for (const [name, wert] of Object.entries(testUmgebung)) {
  if (process.env[name] === undefined || process.env[name] === "") {
    process.env[name] = wert;
  }
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
