import { applyGlossary } from "./glossary";

const LIBRETRANSLATE_URL = process.env["LIBRETRANSLATE_URL"] ?? "http://localhost:5000";

async function translateText(text: string, source: "de" | "en", target: "de" | "en"): Promise<string> {
  if (!text?.trim()) return text;
  // Protect domain terms: substitute to target-language before MT so the engine passes them through.
  const prepared = applyGlossary(text, source, target);
  const resp = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: prepared, source, target, format: "text" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`LibreTranslate error: ${resp.status}`);
  const data = await resp.json() as { translatedText: string };
  // Safety pass: fix any glossary term the engine left in source form.
  return applyGlossary(data.translatedText ?? prepared, source, target);
}

export async function translateToLanguages(
  fields: Record<string, string>,
  sourceLang: "de" | "en"
): Promise<Record<string, string>> {
  const targetLang = sourceLang === "de" ? "en" : "de";
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!value?.trim()) continue;
    try {
      result[`${targetLang}_${key}`] = await translateText(value, sourceLang, targetLang);
      result[`${sourceLang}_${key}`] = value;
    } catch {
      // silent fallback — translation not critical
    }
  }
  return result;
}
