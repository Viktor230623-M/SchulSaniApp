#!/usr/bin/env node
// Sendet Entwürfe aus entwuerfe/ über die Resend API.
// Aufruf: node senden.mjs <anzahl>   (sendet die ersten <anzahl> alphabetisch)
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const FROM = "SchulSaniApp <viktor@schulsaniapp.com>";
const REPLY_TO = "viktor@schulsaniapp.com";

const anzahl = parseInt(process.argv[2] || "1", 10);
const entwuerfeDir = join(__dirname, "entwuerfe");
const gesendetFile = join(__dirname, "gesendet.log");

const bereitsGesendet = new Set(
  existsSync(gesendetFile) ? readFileSync(gesendetFile, "utf8").trim().split("\n").filter(Boolean) : []
);

const files = readdirSync(entwuerfeDir).filter((f) => f.endsWith(".txt")).sort();

async function send(draft, file) {
  const lines = draft.split("\n");
  const an = lines.find((l) => l.startsWith("An: "))?.slice(4).trim();
  const betreff = lines.find((l) => l.startsWith("Betreff: "))?.slice(9).trim() || "App für Schulsanitätsdienste: kurze Demo";
  // Body: alles nach der Betreff-Zeile (leere Zeile + Rest)
  const betreffIdx = lines.findIndex((l) => l.startsWith("Betreff: "));
  const body = lines.slice(betreffIdx + 2).join("\n").trim();

  if (!an || !an.includes("@")) {
    console.log(`⏭️  Übersprungen (keine Adresse): ${file}`);
    return null;
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
  if (!res.ok) {
    console.log(`❌ ${file} -> ${an}: ${res.status} ${JSON.stringify(data)}`);
    return { file, an, ok: false, error: JSON.stringify(data) };
  }
  console.log(`✅ ${file} -> ${an} | ID ${data.id}`);
  return { file, an, ok: true, id: data.id };
}

(async () => {
  let gesendet = 0;
  const ergebnisse = [];
  for (const file of files) {
    if (gesendet >= anzahl) break;
    if (bereitsGesendet.has(file)) {
      console.log(`⏭️  Schon gesendet: ${file}`);
      continue;
    }
    const draft = readFileSync(join(entwuerfeDir, file), "utf8");
    const ergebnis = await send(draft, file);
    if (ergebnis) {
      ergebnisse.push(ergebnis);
      if (ergebnis.ok) {
        gesendet++;
        writeFileSync(gesendetFile, file + "\n", { flag: "a" });
      }
      await new Promise((r) => setTimeout(r, 400)); // sanftes Rate-Limit
    }
  }
  console.log(`\n=== Fertig: ${gesendet} gesendet ===`);
})().catch((e) => { console.error(e); process.exit(1); });
