/**
 * Versionsstand aus den Commit-Nachrichten bestimmen und setzen.
 *
 * Das Repository schreibt Conventional Commits ("feat(push): ..."), damit
 * laesst sich die naechste Version ableiten, statt sie von Hand zu raten:
 *
 *   Bruch  (! nach dem Bereich oder "BREAKING CHANGE" im Rumpf) -> Major
 *   feat                                                        -> Minor
 *   fix, perf                                                   -> Patch
 *   alles andere (chore, docs, refactor, ops, test)             -> kein Anlass
 *
 * Steht seit dem letzten Tag nur Beiwerk an, gibt es nichts zu veroeffentlichen
 * und das Skript bricht ab. Mit --patch laesst sich das ueberstimmen.
 *
 * Aufruf:
 *   pnpm release                 Version ableiten, Dateien setzen, committen, taggen
 *   pnpm release --dry-run       nur anzeigen, nichts anfassen
 *   pnpm release --major|--minor|--patch     Stufe erzwingen
 *   pnpm release --as 3.0.0      Version voll vorgeben
 *
 * Bewusst reines JavaScript ohne Transpile-Schritt: der esbuild-Eintrag im
 * Lockfile ist auf linux-x64 festgelegt, weshalb tsx auf einem Mac nicht
 * laeuft. Ein Werkzeug fuer die Veroeffentlichung muss ueberall starten.
 *
 * Semantic Versioning hat genau drei Zahlen: MAJOR.MINOR.PATCH. Eine vierte
 * Stelle gibt es nicht. Was bei nativen Apps wie eine vierte Stelle wirkt, ist
 * die Build-Nummer -- die zaehlt getrennt hoch und wird hier mitgefuehrt:
 * ios.buildNumber und android.versionCode. Zwei Auslieferungen derselben
 * Version an die Stores brauchen zwingend verschiedene Build-Nummern.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const APP_JSON = join(REPO, "artifacts", "paramedic-app", "app.json");
const APP_PACKAGE = join(REPO, "artifacts", "paramedic-app", "package.json");
const CHANGELOG = join(REPO, "CHANGELOG.md");

/** Ueberschriften im Changelog, nach Commit-Typ. */
const RUBRIKEN = {
  feat: "Neu",
  fix: "Behoben",
  perf: "Schneller",
  refactor: "Umbau",
  ops: "Betrieb",
  docs: "Dokumentation",
};

function git(...args) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
}

function lies(pfad) {
  return readFileSync(pfad, "utf8");
}

/**
 * Version in einer JSON-Datei ersetzen, ohne sie neu zu formatieren.
 *
 * JSON.parse/stringify wuerde Einrueckung und Schluesselreihenfolge
 * umschreiben und den Diff unlesbar machen. Deshalb gezielt die eine Zeile.
 */
function setzeJsonWert(inhalt, schluessel, wert) {
  const wortlaut = typeof wert === "number" ? String(wert) : `"${wert}"`;
  const muster = new RegExp(`("${schluessel}"\\s*:\\s*)("[^"]*"|\\d+)`);
  if (!muster.test(inhalt)) {
    throw new Error(`Schluessel "${schluessel}" nicht gefunden`);
  }
  return inhalt.replace(muster, `$1${wortlaut}`);
}

function leseJsonWert(inhalt, schluessel) {
  const treffer = inhalt.match(new RegExp(`"${schluessel}"\\s*:\\s*("([^"]*)"|(\\d+))`));
  return treffer ? (treffer[2] ?? treffer[3]) : undefined;
}

/** Letzter Versions-Tag, oder undefined beim allerersten Lauf. */
function letzterTag() {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v*");
  } catch {
    return undefined;
  }
}

function commitsSeit(tag) {
  const bereich = tag ? `${tag}..HEAD` : "HEAD";
  const roh = git("log", bereich, "--no-merges", "--format=%H%x00%s%x00%b%x1e");
  if (!roh) return [];

  return roh
    .split("\x1e")
    .map((eintrag) => eintrag.trim())
    .filter(Boolean)
    .map((eintrag) => {
      const [hash, betreff, rumpf = ""] = eintrag.split("\x00");
      const kopf = (betreff ?? "").match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/);

      return {
        hash: (hash ?? "").slice(0, 7),
        typ: kopf?.[1] ?? "",
        bereich: kopf?.[2] ?? "",
        bruch: Boolean(kopf?.[3]) || /BREAKING[ -]CHANGE/.test(rumpf),
        beschreibung: kopf?.[4] ?? betreff ?? "",
      };
    });
}

function stufeAus(commits) {
  if (commits.some((c) => c.bruch)) return "major";
  if (commits.some((c) => c.typ === "feat")) return "minor";
  if (commits.some((c) => c.typ === "fix" || c.typ === "perf")) return "patch";
  return undefined;
}

function erhoehe(version, stufe) {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number);
  if (stufe === "major") return `${major + 1}.0.0`;
  if (stufe === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function changelogAbschnitt(version, commits, datum) {
  const zeilen = [`## ${version} — ${datum}`, ""];

  const brueche = commits.filter((c) => c.bruch);
  if (brueche.length) {
    zeilen.push("### Bricht bestehendes Verhalten", "");
    for (const c of brueche) {
      zeilen.push(`- ${c.bereich ? `**${c.bereich}:** ` : ""}${c.beschreibung} (${c.hash})`);
    }
    zeilen.push("");
  }

  for (const [typ, ueberschrift] of Object.entries(RUBRIKEN)) {
    const passende = commits.filter((c) => c.typ === typ && !c.bruch);
    if (!passende.length) continue;
    zeilen.push(`### ${ueberschrift}`, "");
    for (const c of passende) {
      zeilen.push(`- ${c.bereich ? `**${c.bereich}:** ` : ""}${c.beschreibung} (${c.hash})`);
    }
    zeilen.push("");
  }

  return zeilen.join("\n");
}

function main() {
  const argumente = process.argv.slice(2);
  const probelauf = argumente.includes("--dry-run");

  const arbeitsbaum = git("status", "--porcelain", "--untracked-files=no");
  if (arbeitsbaum && !probelauf) {
    console.error("Arbeitsbaum ist nicht sauber. Erst committen oder wegpacken.");
    process.exit(1);
  }

  const appJson = lies(APP_JSON);
  const aktuell = leseJsonWert(appJson, "version");
  if (!aktuell) {
    console.error("Keine Version in app.json gefunden.");
    process.exit(1);
  }

  const tag = letzterTag();
  const commits = commitsSeit(tag);

  const vorgabe = argumente.indexOf("--as");
  let neu;

  if (vorgabe !== -1) {
    const wert = argumente[vorgabe + 1];
    if (!wert || !/^\d+\.\d+\.\d+$/.test(wert)) {
      console.error("--as braucht eine Version aus genau drei Zahlen, etwa 2.1.0.");
      process.exit(1);
    }
    neu = wert;
  } else {
    const erzwungen = ["major", "minor", "patch"].find((s) => argumente.includes(`--${s}`));
    const abgeleitet = erzwungen ?? stufeAus(commits);

    if (!abgeleitet) {
      const seit = tag ? `seit ${tag}` : "in der Historie";
      console.error(
        `Kein Anlass fuer eine neue Version: ${commits.length} Commits ${seit}, ` +
          "aber weder feat noch fix noch Bruch darunter.\n" +
          "Mit --patch laesst sich trotzdem eine Version setzen.",
      );
      process.exit(1);
    }
    neu = erhoehe(aktuell, abgeleitet);
  }

  // Build-Nummer zaehlt unabhaengig von der Version hoch. Die Stores lehnen
  // einen erneuten Upload mit derselben Build-Nummer ab, auch wenn sich die
  // Version geaendert hat.
  const buildAlt = Number(leseJsonWert(appJson, "buildNumber") ?? 0);
  const buildNeu = buildAlt + 1;

  console.log(`${aktuell} -> ${neu}  (Build ${buildAlt} -> ${buildNeu})`);
  console.log(`${commits.length} Commits${tag ? ` seit ${tag}` : ""}`);

  if (probelauf) {
    console.log("\n--- Changelog-Vorschau ---\n");
    console.log(changelogAbschnitt(neu, commits, new Date().toISOString().slice(0, 10)));
    return;
  }

  let neuesAppJson = setzeJsonWert(appJson, "version", neu);
  neuesAppJson = setzeJsonWert(neuesAppJson, "buildNumber", String(buildNeu));
  neuesAppJson = setzeJsonWert(neuesAppJson, "versionCode", buildNeu);
  writeFileSync(APP_JSON, neuesAppJson);

  writeFileSync(APP_PACKAGE, setzeJsonWert(lies(APP_PACKAGE), "version", neu));

  const datum = new Date().toISOString().slice(0, 10);
  const abschnitt = changelogAbschnitt(neu, commits, datum);
  const kopf = "# Changelog\n\n";
  const bestand = existsSync(CHANGELOG) ? lies(CHANGELOG).replace(kopf, "") : "";
  writeFileSync(CHANGELOG, `${kopf}${abschnitt}\n${bestand}`.trimEnd() + "\n");

  git("add", APP_JSON, APP_PACKAGE, CHANGELOG);
  git("commit", "-m", `chore(release): v${neu}`);
  git("tag", "-a", `v${neu}`, "-m", `v${neu}`);

  console.log(`\nCommit und Tag v${neu} angelegt.`);
  console.log("Veroeffentlichen mit: git push origin main --follow-tags");
}

main();
