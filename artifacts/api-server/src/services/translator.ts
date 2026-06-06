const LIBRETRANSLATE_URL = process.env["LIBRETRANSLATE_URL"] ?? "http://localhost:5000";

async function translateText(text: string, source: string, target: string): Promise<string> {
  if (!text?.trim()) return text;
  const resp = await fetch(`${LIBRETRANSLATE_URL}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source, target, format: "text" }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`LibreTranslate error: ${resp.status}`);
  const data = await resp.json() as { translatedText: string };
  return data.translatedText ?? text;
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
