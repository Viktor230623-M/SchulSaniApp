// Erzeugt public/manifest.json und public/sw.js aus den Vorlagen
// public/manifest.template.json und public/sw.template.js.
//
// public/ wird von "expo export --platform web" unveraendert nach dist/
// kopiert — die Dateien dort koennen zur Laufzeit keine Env-Variablen lesen.
// Deshalb laeuft dieses Skript vor jedem Web-Export (siehe package.json,
// Skript "build:web") und setzt die Instanzwerte als Text ein.
//
// Fehlt ein Pflichtwert, bricht das Skript ab, bevor ueberhaupt gebaut wird.

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function loadDotEnv(dateipfad) {
  if (!fs.existsSync(dateipfad)) return;
  const inhalt = fs.readFileSync(dateipfad, "utf-8");
  for (const zeile of inhalt.split("\n")) {
    const getrimmt = zeile.trim();
    if (!getrimmt || getrimmt.startsWith("#")) continue;
    const trenner = getrimmt.indexOf("=");
    if (trenner === -1) continue;
    const schluessel = getrimmt.slice(0, trenner).trim();
    let wert = getrimmt.slice(trenner + 1).trim();
    if (
      (wert.startsWith('"') && wert.endsWith('"')) ||
      (wert.startsWith("'") && wert.endsWith("'"))
    ) {
      wert = wert.slice(1, -1);
    }
    if (process.env[schluessel] === undefined) {
      process.env[schluessel] = wert;
    }
  }
}

loadDotEnv(path.join(projectRoot, ".env"));

function pflicht(name) {
  const wert = process.env[name] ? process.env[name].trim() : "";
  if (!wert) {
    console.error(
      `Konfiguration fehlt: ${name} ist nicht gesetzt. ` +
        "Wert in artifacts/paramedic-app/.env eintragen (Vorlage: .env.example).",
    );
    process.exit(1);
  }
  return wert;
}

function ersetze(inhalt, werte) {
  let ergebnis = inhalt;
  for (const [platzhalter, wert] of Object.entries(werte)) {
    ergebnis = ergebnis.split(`__${platzhalter}__`).join(wert);
  }
  return ergebnis;
}

function main() {
  const appName = pflicht("EXPO_PUBLIC_APP_NAME");
  const schoolName = pflicht("EXPO_PUBLIC_SCHOOL_NAME");
  const themeColor = pflicht("EXPO_PUBLIC_THEME_COLOR");

  const werte = { APP_NAME: appName, SCHOOL_NAME: schoolName, THEME_COLOR: themeColor };

  const manifestVorlage = fs.readFileSync(
    path.join(projectRoot, "public", "manifest.template.json"),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(projectRoot, "public", "manifest.json"),
    ersetze(manifestVorlage, werte),
  );

  const swVorlage = fs.readFileSync(path.join(projectRoot, "public", "sw.template.js"), "utf-8");
  fs.writeFileSync(path.join(projectRoot, "public", "sw.js"), ersetze(swVorlage, werte));

  console.log(`Web-Assets erzeugt fuer Instanz "${appName}".`);
}

main();
