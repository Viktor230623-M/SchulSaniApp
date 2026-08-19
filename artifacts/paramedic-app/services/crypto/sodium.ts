import { Platform } from "react-native";

/**
 * Einzige Krypto-Quelle: libsodium. Auf dem Web die WASM-Variante
 * (libsodium-wrappers), nativ react-native-libsodium (JSI-Bindings, braucht
 * einen nativen Build -- im Expo Go nicht verfuegbar). Beide bieten dieselben
 * synchronen Funktionen; `ready` ist jeweils erst abzuwarten.
 *
 * Keine selbstgebauten Primitive: Die Schluesselableitung (Argon2id), die
 * Inhaltsverschluesselung (secretbox) und das Verpacken der Datenschluessel
 * (box_seal) kommen komplett aus dieser Bibliothek.
 */

export interface Sodium {
  crypto_secretbox_NONCEBYTES: number;
  randombytes_buf(length: number): Uint8Array;
  crypto_pwhash(
    keyLength: number,
    password: string,
    salt: Uint8Array,
    opsLimit: number,
    memLimit: number,
    algorithm: number,
  ): Uint8Array;
  crypto_secretbox_easy(message: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
  crypto_secretbox_open_easy(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
  crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  crypto_box_seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
  crypto_box_seal_open(sealed: Uint8Array, publicKey: Uint8Array, privateKey: Uint8Array): Uint8Array;
}

let instance: Sodium | null = null;

export async function loadSodium(): Promise<Sodium> {
  if (instance) return instance;

  if (Platform.OS === "web") {
    // Sumo-Build: crypto_pwhash (Argon2id) ist nur dort enthalten, nicht in
    // der Standard-Build von libsodium-wrappers.
    const mod = await import("libsodium-wrappers-sumo");
    // 0.8.x exportiert ESM mit default export; aeltere Builds haengen die
    // Funktionen direkt an den Namespace. Beide Formen landen hier.
    const sodium = (mod as { default?: unknown }).default ?? mod;
    const s = sodium as typeof import("libsodium-wrappers-sumo");
    await s.ready;
    instance = {
      crypto_secretbox_NONCEBYTES: s.crypto_secretbox_NONCEBYTES,
      randombytes_buf: (n) => s.randombytes_buf(n),
      crypto_pwhash: (a, b, c, d, e, f) => s.crypto_pwhash(a, b, c, d, e, f),
      crypto_secretbox_easy: (m, n, k) => s.crypto_secretbox_easy(m, n, k),
      crypto_secretbox_open_easy: (c, n, k) => s.crypto_secretbox_open_easy(c, n, k),
      crypto_box_keypair: () => s.crypto_box_keypair(),
      crypto_box_seal: (m, pk) => s.crypto_box_seal(m, pk),
      crypto_box_seal_open: (sealed, pk, sk) => s.crypto_box_seal_open(sealed, pk, sk),
    };
    return instance;
  }

  // Nativ: react-native-libsodium. Der require ist absichtlich dynamisch --
  // das Modul existiert im Expo Go nicht und der Fehler soll erst beim Laden
  // auftreten, nicht beim Bundling des Web-Pfads.
  let mod: any;
  try {
    mod = require("react-native-libsodium");
  } catch {
    throw new Error(
      "Verschluesselung ist auf diesem Geraet nicht verfuegbar (react-native-libsodium fehlt). " +
        "Bitte eine Build-Version der App verwenden.",
    );
  }
  await mod.ready;
  instance = {
    crypto_secretbox_NONCEBYTES: mod.crypto_secretbox_NONCEBYTES,
    randombytes_buf: (n) => mod.randombytes_buf(n),
    crypto_pwhash: (a, b, c, d, e, f) => mod.crypto_pwhash(a, b, c, d, e, f),
    crypto_secretbox_easy: (m, n, k) => mod.crypto_secretbox_easy(m, n, k),
    crypto_secretbox_open_easy: (c, n, k) => mod.crypto_secretbox_open_easy(c, n, k),
    crypto_box_keypair: () => mod.crypto_box_keypair(),
    crypto_box_seal: (m, pk) => mod.crypto_box_seal(m, pk),
    crypto_box_seal_open: (s, pk, sk) => mod.crypto_box_seal_open(s, pk, sk),
  };
  return instance;
}
