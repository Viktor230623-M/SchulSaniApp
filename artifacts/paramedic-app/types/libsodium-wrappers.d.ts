// libsodium-wrappers bringt keine eigenen Typen mit; deklariert wird hier nur
// die Teilmenge, die die Krypto-Schicht tatsaechlich nutzt. Alle verwendeten
// Funktionen sind libsodium-Standard-Primitive (Argon2id, secretbox, box_seal).
// Der Web-Pfad nutzt die Sumo-Build, weil crypto_pwhash dort enthalten ist.
declare module "libsodium-wrappers-sumo" {
  export const ready: Promise<void>;
  export const crypto_secretbox_NONCEBYTES: number;
  export const crypto_secretbox_KEYBYTES: number;
  export const crypto_box_PUBLICKEYBYTES: number;
  export const crypto_box_SECRETKEYBYTES: number;
  export const crypto_pwhash_SALTBYTES: number;
  export const crypto_pwhash_OPSLIMIT_MODERATE: number;
  export const crypto_pwhash_MEMLIMIT_MODERATE: number;

  export function randombytes_buf(length: number): Uint8Array;
  export function crypto_pwhash(
    keyLength: number,
    password: string,
    salt: Uint8Array,
    opsLimit: number,
    memLimit: number,
    algorithm: number,
  ): Uint8Array;
  export function crypto_secretbox_easy(
    message: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  export function crypto_secretbox_open_easy(
    ciphertext: Uint8Array,
    nonce: Uint8Array,
    key: Uint8Array,
  ): Uint8Array;
  export function crypto_box_keypair(): { publicKey: Uint8Array; privateKey: Uint8Array };
  export function crypto_box_seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array;
  export function crypto_box_seal_open(
    sealed: Uint8Array,
    publicKey: Uint8Array,
    privateKey: Uint8Array,
  ): Uint8Array;
}
