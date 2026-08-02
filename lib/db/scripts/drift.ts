// Waechter gegen Abweichung zwischen Code-Schema und Migrationsstand.
//
// Kopiert den vorhandenen Migrationsordner in ein temporaeres Verzeichnis,
// laesst drizzle-kit generate gegen dieses Verzeichnis laufen und prueft, ob
// dabei eine neue SQL-Datei entstanden waere. Entsteht keine, ist das
// Code-Schema deckungsgleich mit dem zuletzt erzeugten Migrationsstand.
//
// DATABASE_URL wird bewusst auf eine wirkungslose Attrappe gesetzt: generate
// baut keine Verbindung zur Datenbank auf, braucht die Variable aber, damit
// drizzle.config.ts nicht mit einem Fehler abbricht.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HIER, "..");
const DRIZZLE_KIT = path.join(ROOT, "node_modules", ".bin", "drizzle-kit");
const SCHEMA_PFAD = path.join(ROOT, "src", "schema", "index.ts");
const ORIGINAL_DRIZZLE = path.join(ROOT, "drizzle");

function main(): number {
  const tempVerzeichnis = fs.mkdtempSync(path.join(os.tmpdir(), "drift-"));

  try {
    // Vorhandenen Migrationsordner in das temporaere Verzeichnis kopieren,
    // damit generate den gleichen Ausgangsstand sieht wie im Projekt.
    fs.cpSync(ORIGINAL_DRIZZLE, tempVerzeichnis, { recursive: true });

    const dateienVorher = new Set(dateiListe(tempVerzeichnis));

    // drizzle-kit haengt "./" unbesehen vor "out" an, um Snapshot-Pfade zu
    // bilden. Bei einem absoluten Pfad ergibt das ".//tmp/..." und wird als
    // relativ zum cwd fehlinterpretiert (ENOENT). Deshalb hier ein relativer
    // Pfad, ausgehend vom cwd des Kindprozesses (ROOT).
    const outRelativ = path.relative(ROOT, tempVerzeichnis);

    const tempConfigPfad = path.join(tempVerzeichnis, "drift-config.ts");
    fs.writeFileSync(
      tempConfigPfad,
      `import { defineConfig } from "drizzle-kit";\n` +
        `export default defineConfig({\n` +
        `  schema: ${JSON.stringify(SCHEMA_PFAD)},\n` +
        `  out: ${JSON.stringify(outRelativ)},\n` +
        `  dialect: "postgresql",\n` +
        `  dbCredentials: { url: process.env.DATABASE_URL! },\n` +
        `});\n`,
    );

    let ausgabe = "";
    try {
      ausgabe = execFileSync(
        DRIZZLE_KIT,
        ["generate", "--config", tempConfigPfad],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            DATABASE_URL: "postgresql://drift:drift@127.0.0.1:1/drift",
          },
          encoding: "utf-8",
          // drizzle-kit fragt bei mehrdeutigen Aenderungen (z.B. neue Spalte
          // vs. Umbenennung) interaktiv nach. Bei stdin:"ignore" bricht es
          // das lautlos mit Rueckgabewert 0 ab, ohne Migration zu schreiben
          // — ein stiller Fehlalarm-Freispruch. Stattdessen genug Eingaben
          // mitliefern, damit jede Rueckfrage mit der Vorgabe (Enter)
          // beantwortet wird. stdio explizit auf "pipe" setzen, sonst geht
          // stderr des Kindprozesses am Fehlerobjekt vorbei direkt auf das
          // eigene stderr durch, statt eingefangen zu werden.
          input: "\n".repeat(20),
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    } catch (fehler: unknown) {
      const e = fehler as { stdout?: string; stderr?: string; message?: string };
      ausgabe = `${e.stdout ?? ""}${e.stderr ?? ""}${e.message ?? ""}`;

      if (ausgabe.includes("installed esbuild for another platform")) {
        console.log(
          "Drift-Pruefung uebersprungen: drizzle-kit ist auf dieser Plattform " +
            "nicht lauffaehig (siehe overrides in pnpm-workspace.yaml).",
        );
        return 0;
      }

      throw fehler;
    }

    if (ausgabe.includes("installed esbuild for another platform")) {
      console.log(
        "Drift-Pruefung uebersprungen: drizzle-kit ist auf dieser Plattform " +
          "nicht lauffaehig (siehe overrides in pnpm-workspace.yaml).",
      );
      return 0;
    }

    const dateienNachher = dateiListe(tempVerzeichnis);
    const neueDateien = dateienNachher.filter(
      (datei) => datei.endsWith(".sql") && !dateienVorher.has(datei),
    );

    if (neueDateien.length > 0) {
      for (const datei of neueDateien) {
        console.log(fs.readFileSync(path.join(tempVerzeichnis, datei), "utf-8"));
      }
      console.log(
        "Drift erkannt: das Code-Schema weicht vom Migrationsstand ab. " +
          "Fehlende Migration erzeugen mit: pnpm --filter @workspace/db run generate",
      );
      return 1;
    }

    console.log("Kein Drift");
    return 0;
  } finally {
    fs.rmSync(tempVerzeichnis, { recursive: true, force: true });
  }
}

function dateiListe(verzeichnis: string): string[] {
  return fs.readdirSync(verzeichnis);
}

process.exit(main());
