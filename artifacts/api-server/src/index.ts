import { existsSync } from "node:fs";
import { join } from "node:path";

// Geheimnisse stehen in artifacts/api-server/.env (chmod 600), nicht in der
// Prozesskonfiguration. Node liest die Datei selbst; bereits gesetzte
// Variablen werden dabei nicht ueberschrieben. Muss vor dem Laden von ./app
// geschehen, weil dort JWT_SECRET beim Import geprueft wird.
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main(): Promise<void> {
  const { default: app } = await import("./app");
  const { startScheduler } = await import("./jobs/scheduler");
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    startScheduler();
  });
}

void main();
