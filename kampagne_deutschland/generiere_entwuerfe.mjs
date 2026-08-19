#!/usr/bin/env node
// Generiert personalisierte Outreach-Entwürfe für alle Schulen in leads_ssd_deutschland.csv
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rows = readFileSync(join(__dirname, "leads_ssd_deutschland.csv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((l) => l.split(";"));

const FRAUEN = new Set([
  "andrea", "anja", "ann-isabel", "annette", "christiane", "claudia", "gabriele", "gulfira",
  "heike", "ines", "iris", "judith", "julia", "katharina", "katrin", "kerstin", "liane",
  "margarete", "marie", "marion", "maren", "monika", "nicole", "ramona", "sabrina",
  "sandra", "sara", "sarah", "silke", "sonja", "stefanie", "tanja", "ute", "verena",
  "wibke", "wibke", "anja", "petra", "saskia", "miriam", "anne", "anke", "bettina",
  "birgit", "britta", "carmen", "dagmar", "daniela", "elke", "eva", "frauke", "grit",
  "heike", "ila", "jana", "johanna", "kathrin", "katja", "kirsten", "linda", "manuela",
  "maren", "margot", "marlies", "melanie", "michaela", "natalie", "petra", "regina",
  "sabine", "sigrid", "susanne", "sylvia", "tina", "ullrike", "ursula", "vera", "waltraud",
]);

const MAENNER = new Set([
  "alexander", "andreas", "benjamin", "bernd", "carsten", "christian", "christoph", "daniel",
  "dirk", "dominik", "falk", "frank", "frederik", "goetz", "götz", "gunnar", "hans",
  "heiko", "heinrich", "helge", "ingo", "jan", "jens", "joachim", "joerg", "jörg", "jochen",
  "johannes", "jonas", "jürgen", "kai", "karl", "kilian", "klaus", "lars", "lorenz",
  "lucas", "lukas", "manfred", "marc", "marco", "marcus", "markus", "martin", "mathias",
  "matthias", "michael", "mike", "mirko", "niclas", "olaf", "oliver", "patrick", "paul",
  "peter", "philipp", "ralf", "ralph", "robert", "roland", "roman", "ronald", "sascha",
  "sebastian", "siegfried", "simon", "stefan", "steffen", "stefen", "sven", "thilo",
  "thomas", "thorsten", "timo", "tobias", "torben", "torsten", "ulrich", "uwe", "valentin",
  "volker", "waldemar", "werner", "wieland", "wolfgang",  "markus", "michael", "mike", "sascha", "benedikt", "andré", "andre", "gunnar", "florian",
  "felix", "maximilian", "marcel", "marius", "niklas", "till", "tim", "vincent", "yannick",
  "simon", "steven", "adrian", "anton", "arthur", "bastian", "carlo", "cedric", "dennis",
  "edgar", "eric", "erik", "fabian", "friedrich", "georg", "gerhard", "gernot", "holger",
  "jasper", "jerome", "jonathan", "julian", "justus", "konstantin", "leon", "louis", "malte",
  "mats", "milan", "nico", "noah", "ole", "oskar", "pascal", "quentin", "ralf", "remco",
  "rico", "ronny", "ruben", "samuel", "sascha", "stefen", "swen", "tilman", "tom", "veit",
]);

function nachname(voll) {
  const teile = voll.replace(/\(.*\)/g, "").trim().split(/\s+/);
  return teile[teile.length - 1];
}

function anrede(schulleitung) {
  const s = schulleitung.trim().replace(/\s*\(.*\)/, "").trim();
  if (!s || s === "(Schulleitung)" || s.startsWith("(k.A.)")) return "Sehr geehrte Schulleitung,";
  const lower = s.toLowerCase();
  if (lower.includes("frau")) return `Sehr geehrte ${s},`;
  if (lower.includes("herr")) return `Sehr geehrter ${s},`;
  // Nur Name ohne Titel: Geschlecht über den Vornamen ableiten
  let vorname = lower.split(/\s+/)[0].replace(/\./g, "");
  // Initialen wie "J.-P." überspringen
  if (/^[a-z](-[a-z])?$/.test(vorname) && lower.split(/\s+/)[1]) vorname = lower.split(/\s+/)[1].replace(/\./g, "");
  if (vorname === "dr" || vorname === "prof") vorname = lower.split(/\s+/)[1].replace(/\./g, "");
  if (FRAUEN.has(vorname)) return `Sehr geehrte Frau ${nachname(s)},`;
  if (MAENNER.has(vorname)) return `Sehr geehrter Herr ${nachname(s)},`;
  return "Sehr geehrte Schulleitung,";
}

const body = (anrede) => `${anrede}

Ich bin Schüler am Gymnasium Blankenese und habe eine App für Schulsanitätsdienste entwickelt. Ich bin sehr interessiert daran, sie an Ihrer Schule vorzustellen.

Sie können sich die App direkt ansehen unter demo.schulsaniapp.com. Keine Anmeldung nötig, Sie sehen sofort, wie ein Einsatz, das Protokoll und der Dienstplan aussehen.

Die App ersetzt den Papierkram: Das Einsatzprotokoll wird direkt am Handy ausgefüllt und als PDF exportiert, die Sanitäter:innen werden per Push-Nachricht alarmiert statt über eine Durchsage, und Dienstplan samt Vertretung laufen in derselben App.

Zum Datenschutz, kurz und konkret: Die Schule bleibt datenschutzrechtlich Verantwortliche, ich bin Auftragsverarbeiter, dafür schließen wir einen Vertrag nach Art. 28 DSGVO. Die Server stehen in der EU (Frankfurt). Die Schule bestimmt, wann sie ihre Protokolle bekommt, halbjährlich, jährlich oder nach fünf Jahren, alles als ein PDF-Bündel, und nach dem Download werden die Daten bei mir gelöscht. Wer es lieber ganz selbst betreibt, kann die App auch auf eigenen Servern hosten.

Hätten Sie oder die betreuende Lehrkraft Interesse an einer kurzen Demo? Zwanzig Minuten reichen. Kosten entstehen keine, und es ist komplett unverbindlich.

Erreichbar bin ich unter dieser E-Mail-Adresse oder telefonisch: 0160 96245201.

Mit freundlichen Grüßen
Viktor Gnjatic · SchulSaniApp
`;

const outDir = join(__dirname, "entwuerfe");
mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [schule, stadt, , schulleitung, email] of rows) {
  const slug = schule.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const anredeText = anrede(schulleitung);
  const content = `An: ${email}\nBetreff: App für Schulsanitätsdienste: kurze Demo\n\n${body(anredeText)}`;
  writeFileSync(join(outDir, `${slug}-${stadt.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`), content, "utf8");
  count++;
}
console.log(`✅ ${count} Entwürfe erzeugt in kampagne_deutschland/entwuerfe/`);
