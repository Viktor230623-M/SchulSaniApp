export function localized(
  item: { translationsJson?: string | null },
  field: string,
  lang: string,
  fallback: string
): string {
  if (lang === "en" && item.translationsJson) {
    try {
      const translations = JSON.parse(item.translationsJson) as Record<string, string>;
      return translations[`en_${field}`] ?? fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
