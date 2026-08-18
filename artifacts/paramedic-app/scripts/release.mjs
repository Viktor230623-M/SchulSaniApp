// Setzt Version + Build-Nummer fuer einen Store-Release zentral in app.json
// (und spiegelt die Version nach package.json). app.config.ts liest die Werte
// aus app.json — hier ist die einzige Stelle, die sie schreibt.
//
// Aufruf:
//   node scripts/release.mjs 2.2.0            # Version setzen, Build-Nummer hochzaehlen
//   node scripts/release.mjs 2.2.0 --build 7  # Version setzen, Build-Nummer explizit
//   node scripts/release.mjs --build 8        # nur Build-Nummer hochzaehlen
//   node scripts/release.mjs --show           # aktuellen Stand anzeigen
//
// ios.buildNumber und android.versionCode werden immer zusammen gesetzt,
// damit beide Stores dieselbe Release-Stufe sehen.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appJsonPath = resolve(projectRoot, "app.json");
const packageJsonPath = resolve(projectRoot, "package.json");

const SEMVER = /^\d+\.\d+\.\d+$/;

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}

function writeJson(p, data) {
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function nextBuildNumber(current) {
  const n = parseInt(current, 10);
  return Number.isFinite(n) ? String(n + 1) : "1";
}

function show(appJson, packageJson) {
  console.log("app.json:");
  console.log(`  version:       ${appJson.expo.version}`);
  console.log(`  ios.buildNumber: ${appJson.expo.ios?.buildNumber ?? "(fehlt)"}`);
  console.log(`  android.versionCode: ${appJson.expo.android?.versionCode ?? "(fehlt)"}`);
  console.log("package.json:");
  console.log(`  version:       ${packageJson.version}`);
}

function main() {
  const args = process.argv.slice(2);
  const flags = { show: false, build: null, version: null };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--show") {
      flags.show = true;
    } else if (arg.startsWith("--build=")) {
      flags.build = arg.slice("--build=".length);
    } else if (arg === "--build") {
      flags.build = args[++i];
      if (flags.build === undefined || !/^\d+$/.test(flags.build)) {
        console.error("--build braucht eine ganze Zahl (z.B. --build 8)");
        process.exit(1);
      }
    } else if (SEMVER.test(arg)) {
      flags.version = arg;
    } else {
      console.error(`Unbekanntes Argument: ${arg}`);
      process.exit(1);
    }
  }

  if (flags.show) {
    show(readJson(appJsonPath), readJson(packageJsonPath));
    return;
  }

  if (!flags.version && flags.build === null) {
    console.error(
      "Nichts zu tun. Aufruf z.B.: node scripts/release.mjs 2.2.0 oder node scripts/release.mjs --build 8",
    );
    process.exit(1);
  }

  if (flags.version !== null && !SEMVER.test(flags.version)) {
    console.error(`Ungueltige Version: ${flags.version} (erwartet z.B. 2.2.0)`);
    process.exit(1);
  }

  if (flags.build !== null && !/^\d+$/.test(flags.build)) {
    console.error(`Ungueltige Build-Nummer: ${flags.build} (erwartet eine ganze Zahl)`);
    process.exit(1);
  }

  const appJson = readJson(appJsonPath);
  const packageJson = readJson(packageJsonPath);

  if (flags.version) {
    appJson.expo.version = flags.version;
    packageJson.version = flags.version;
    console.log(`Version: ${flags.version}`);
  }

  const currentIos = appJson.expo.ios?.buildNumber ?? "1";
  const currentAndroid = appJson.expo.android?.versionCode ?? 1;
  const next = flags.build ?? nextBuildNumber(currentIos);

  appJson.expo.ios = { ...appJson.expo.ios, buildNumber: next };
  appJson.expo.android = { ...appJson.expo.android, versionCode: parseInt(next, 10) };
  console.log(`Build-Nummer: ${currentIos} -> ${next} (iOS + Android)`);

  writeJson(appJsonPath, appJson);
  writeJson(packageJsonPath, packageJson);
  console.log("app.json + package.json aktualisiert.");
}

main();
