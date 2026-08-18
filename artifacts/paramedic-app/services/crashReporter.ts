import AsyncStorage from "@react-native-async-storage/async-storage";

const CRASH_LOG_KEY = "crash-log-v1";
const MAX_ENTRIES = 10;

/**
 * Haelt die letzten Abstuerze lokal fest, damit sie nach einem Fehlerlauf
 * sichtbar sind. Kein Versand irgendwohin: eine spaetere Crash-Reporter-
 * Anbindung (etwa Sentry) liest hier nur den Bestand. Fehler beim Schreiben
 * duerfen nie selbst crashen.
 */
export async function recordCrash(error: Error, componentStack?: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_LOG_KEY);
    const entries: { at: string; name: string; message: string; stack: string }[] = raw
      ? JSON.parse(raw)
      : [];
    entries.push({
      at: new Date().toISOString(),
      name: error.name,
      message: error.message,
      stack: componentStack ?? error.stack ?? "",
    });
    await AsyncStorage.setItem(CRASH_LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // absichtlich stumm
  }
}
