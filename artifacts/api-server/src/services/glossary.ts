// Custom domain glossary for SchulSaniApp. LibreTranslate doesn't know these
// terms and mistranslates them (e.g. "Schulsanitäter" → "school teachers").
// We substitute the source term with its target-language equivalent BEFORE
// machine translation so the engine passes it through unchanged.
//
// NOTE: never add "Schulsani"/"SchulSani" — it's a substring of the app name
// "SchulSaniApp" and would corrupt it.

export const GLOSSARY: { de: string; en: string }[] = [
  { de: "Schulsanitäterinnen und Schulsanitäter", en: "school paramedics" },
  { de: "Schulsanitäterinnen", en: "school paramedics" },
  { de: "Schulsanitäterin", en: "school paramedic" },
  { de: "Schulsanitäter", en: "school paramedic" },
  { de: "Schulsanitätsdienst", en: "school medical service" },
  { de: "Sanitäterinnen", en: "paramedics" },
  { de: "Sanitäter", en: "paramedic" },
  { de: "Abwesenheitsantrag", en: "absence request" },
  { de: "Abwesenheit", en: "absence" },
  { de: "Einsätze", en: "missions" },
  { de: "Einsatz", en: "mission" },
  { de: "Meldungen", en: "alerts" },
  { de: "Dienst", en: "duty" },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyGlossary(text: string, source: "de" | "en", target: "de" | "en"): string {
  if (source === target || !text) return text;
  const pairs = GLOSSARY
    .map((g) => ({ from: g[source], to: g[target] }))
    .filter((p) => p.from && p.to)
    .sort((a, b) => b.from.length - a.from.length); // longest term first
  let out = text;
  for (const p of pairs) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(p.from)}\\b`, "gi"), p.to);
  }
  return out;
}
