import { applyGlossary } from "./glossary";

export function localTranslationUrl(raw: string | undefined): string | null {
  const value = raw?.trim() || "http://127.0.0.1:5000";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (!["127.0.0.1", "[::1]", "localhost"].includes(url.hostname)) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function translateText(text: string, source: "de" | "en", target: "de" | "en"): Promise<string> {
  const translationUrl = localTranslationUrl(process.env["LIBRETRANSLATE_URL"]);
  if (!translationUrl || !text?.trim()) return text;
  // Protect domain terms: substitute to target-language before MT so the engine passes them through.
  const prepared = applyGlossary(text, source, target);
  const resp = await fetch(`${translationUrl}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: prepared, source, target, format: "text" }),
    signal: AbortSignal.timeout(3000),
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
  if (!localTranslationUrl(process.env["LIBRETRANSLATE_URL"])) return {};
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
