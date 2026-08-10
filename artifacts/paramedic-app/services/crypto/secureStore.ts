import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Ablage fuer das verschluesselte Schluesselmaterial (oeffentlicher Schluessel,
 * mit dem KEK verschluesseltes Chiffrat des privaten Schluessels, enc-Salt).
 *
 * Auf Native gehoert das Material in die Keychain (iOS) bzw. den Keystore
 * (Android) -- nicht in normales Storage. Hier wird ausschliesslich das
 * *Chiffrat* abgelegt; der KEK und der entschluesselte private Schluessel
 * leben nur im Speicher der Sitzung (keyManager). WHEN_UNLOCKED_THIS_DEVICE_ONLY
 * verhindert, dass iOS das Material ueber iCloud/Keychain-Sync auf andere
 * Geraete traegt. Im Web gibt es keine Ablage: dort bleibt alles in-memory.
 *
 * Die Ablage ist ein reiner Offline-Fallback -- die Quelle der Wahrheit bleibt
 * der Server (PUT /crypto/key). Sie ist nie die einzige Kopie.
 */

const KEY = "crypto_key_material_v1";

export interface CachedKeyMaterial {
  publicKey: string;
  encryptedPrivateKey: string;
  saltEnc: string;
}

export async function writeKeyMaterial(data: CachedKeyMaterial): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(data), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Keychain nicht verfuegbar oder voll: die Sitzung laeuft trotzdem
    // in-memory weiter, nur der Offline-Fallback fehlt.
  }
}

export async function readKeyMaterial(): Promise<CachedKeyMaterial | null> {
  if (Platform.OS === "web") return null;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedKeyMaterial>;
    if (
      typeof parsed.publicKey === "string" &&
      typeof parsed.encryptedPrivateKey === "string" &&
      typeof parsed.saltEnc === "string"
    ) {
      return parsed as CachedKeyMaterial;
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearKeyMaterial(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Absichtlich still: Abmeldung muss immer gelingen.
  }
}
