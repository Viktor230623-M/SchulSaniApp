import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { loadSodium, type Sodium } from "./sodium";
import { fromBase64, toBase64, utf8ToBytes, bytesToUtf8 } from "./encoding";

// Muss exakt den Werten des Servers entsprechen (auth/providers/local.ts).
export const ARGON2_OPSLIMIT_MODERATE = 3;
export const ARGON2_MEMLIMIT_MODERATE = 268435456;
export const ARGON2_ALG_ARGON2ID13 = 2;
export const ARGON2_SALT_BYTES = 16;
export const KEY_LENGTH = 32;

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

// Sitzungszustand: Der KEK und der entschluesselte private Schluessel leben
// nur im Speicher dieser Sitzung und werden nie persistiert.
let kek: Uint8Array | null = null;
let keypair: KeyPair | null = null;
let saltEnc: string | null = null;

export function clearCryptoSession(): void {
  kek = null;
  keypair = null;
  saltEnc = null;
}

export function setCryptoSession(state: { kek: Uint8Array; keypair: KeyPair; saltEnc: string }): void {
  kek = state.kek;
  keypair = state.keypair;
  saltEnc = state.saltEnc;
}

export function isUnlocked(): boolean {
  return kek !== null && keypair !== null;
}

export function getKek(): Uint8Array | null {
  return kek;
}

export function getKeypair(): KeyPair | null {
  return keypair;
}

export function getSaltEnc(): string | null {
  return saltEnc;
}

async function sodium(): Promise<Sodium> {
  return loadSodium();
}

/** Zufaelliger Salt fuer die KEK-Ableitung. */
export async function generateSalt(): Promise<string> {
  const s = await sodium();
  return toBase64(s.randombytes_buf(ARGON2_SALT_BYTES));
}

/** Argon2id-Ableitung: Login-Proof und KEK kommen aus derselben Funktion, nur mit anderen Salts. */
export async function deriveKey(secret: string, saltBase64: string): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_pwhash(
    KEY_LENGTH,
    secret,
    fromBase64(saltBase64),
    ARGON2_OPSLIMIT_MODERATE,
    ARGON2_MEMLIMIT_MODERATE,
    ARGON2_ALG_ARGON2ID13,
  );
}

export async function generateKeypair(): Promise<KeyPair> {
  const s = await sodium();
  return s.crypto_box_keypair();
}

/** secretbox: base64(nonce || ciphertext). Das Nonce ist frisch pro Aufruf. */
export async function encryptWithKey(data: Uint8Array, key: Uint8Array): Promise<string> {
  const s = await sodium();
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ciphertext = s.crypto_secretbox_easy(data, nonce, key);
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return toBase64(out);
}

/** Wirft bei fehlgeschlagener Authentifizierung -- Chiffrat wird nie verwendet. */
export async function decryptWithKey(blobBase64: string, key: Uint8Array): Promise<Uint8Array> {
  const s = await sodium();
  const blob = fromBase64(blobBase64);
  if (blob.length < 25) throw new Error("Ungueltiges Chiffrat");
  const nonce = blob.subarray(0, 24);
  const ciphertext = blob.subarray(24);
  return s.crypto_secretbox_open_easy(ciphertext, nonce, key);
}

/** DEK fuer eine Person verpacken (crypto_box_seal). */
export async function wrapFor(dek: Uint8Array, recipientPublicKeyBase64: string): Promise<string> {
  const s = await sodium();
  return toBase64(s.crypto_box_seal(dek, fromBase64(recipientPublicKeyBase64)));
}

/** Eigenen DEK-Umschlag oeffnen. */
export async function unwrapDek(wrappedDekBase64: string, own: KeyPair): Promise<Uint8Array> {
  const s = await sodium();
  return s.crypto_box_seal_open(fromBase64(wrappedDekBase64), own.publicKey, own.privateKey);
}

// --- Fingerprint-Pinning oeffentlicher Schluessel --------------------------
// Der Client merkt sich den Fingerprint (SHA-256) jedes oeffentlichen
// Schluessels, den er beim DEK-Wrapping verwendet. Weicht ein spaeterer Wert
// ab, hat ein boeswilliger Server versucht, den Schluessel still zu tauschen.

const PIN_STORAGE_KEY = "crypto_pk_pins_v1";

async function fingerprint(publicKeyBase64: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, publicKeyBase64);
}

async function loadPins(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(PIN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function savePins(pins: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins));
}

/**
 * Prueft, ob der uebermittelte oeffentliche Schluessel zum Zielnutzer passt
 * (TOFU): Beim ersten Kontakt wird der Fingerprint gespeichert, danach muss
 * er uebereinstimmen. Wirft bei Abweichung.
 */
export async function assertPublicKeyPinned(userId: string, publicKeyBase64: string): Promise<void> {
  const pins = await loadPins();
  const fp = await fingerprint(publicKeyBase64);
  const pinned = pins[userId];
  if (pinned && pinned !== fp) {
    throw new Error("Oeffentlicher Schluessel hat sich geaendert. Verpackung abgebrochen.");
  }
  pins[userId] = fp;
  await savePins(pins);
}

/**
 * Vergisst den gepinnten Fingerprint eines Nutzers. Nur fuer die Admin-Recovery
 * nach Geraeteverlust: Der Nutzer hat ein neues Schluesselpaar erzeugt, der
 * alte Fingerprint ist bewusst ersetzt worden.
 */
export async function forgetPublicKeyPin(userId: string): Promise<void> {
  const pins = await loadPins();
  if (!(userId in pins)) return;
  delete pins[userId];
  await savePins(pins);
}

export async function encryptJson(obj: unknown, key: Uint8Array): Promise<string> {
  return encryptWithKey(utf8ToBytes(JSON.stringify(obj)), key);
}

export async function decryptJson<T = Record<string, unknown>>(blobBase64: string, key: Uint8Array): Promise<T> {
  return JSON.parse(bytesToUtf8(await decryptWithKey(blobBase64, key))) as T;
}
