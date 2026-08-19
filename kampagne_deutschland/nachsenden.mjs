#!/usr/bin/env node
// Sendet die 12 gebouncten Entwürfe erneut an die korrigierten offiziellen Adressen.
// Aufruf: node nachsenden.mjs
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const FROM = "SchulSaniApp <viktor@schulsaniapp.com>";
const REPLY_TO = "viktor@schulsaniapp.com";

const DATEIEN = [
  "albert-schweitzer-schule-albershausen.txt",
  "albert-schweitzer-schule-sinsheim.txt",
  "alexander-von-humboldt-gymnasium-neuss.txt",
  "comenius-gesamtschule-neuss.txt",
  "daniel-straub-realschule-geislingen.txt",
  "dietrich-bonhoeffer-gymnasium-eppelheim.txt",
  "felix-klein-gymnasium-g-ttingen.txt",
  "friedrich-schiller-gemeinschaftsschule-eislingen.txt",
  "gemeinschaftsschule-am-tegelberg-geislingen.txt",
  "georg-b-chner-gymnasium-winnenden.txt",
  "georg-von-giesche-gymnasium-berlin-tegel-.txt",
  "gesamtschule-an-der-erft-neuss.txt",
];

const entwuerfeDir = join(__dirname, "entwuerfe");
const nachsendungen = join(__dirname, "nachsendungen.log");

async function send(file) {
  const draft = readFileSync(join(entwuerfeDir, file), "utf8");
  const lines = draft.split("\n");
  const an = lines.find((l) => l.startsWith("An: "))?.slice(4).trim();
  const betreff = lines.find((l) => l.startsWith("Betreff: "))?.slice(9).trim() || "App für Schulsanitätsdienste: kurze Demo";
  const betreffIdx = lines.findIndex((l) => l.startsWith("Betreff: "));
  const body = lines.slice(betreffIdx + 2).join("\n").trim();

  if (!an || !an.includes("@")) {
    console.log(`⏭️  Keine Adresse: ${file}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [an],
      reply_to: REPLY_TO,
      subject: betreff,
      text: body,
    }),
  });
  const data = await res.json();
  if (res.ok) {
    console.log(`✅ ${file} → ${an} (${data.id})`);
    appendFileSync(nachsendungen, `${new Date().toISOString()} ${file} ${an} ${data.id}\n`);
  } else {
    console.log(`❌ ${file} → ${an}: ${data.message || res.status}`);
  }
}

for (const f of DATEIEN) {
  await send(f);
}
console.log("\nFertig. Log: nachsendungen.log");
