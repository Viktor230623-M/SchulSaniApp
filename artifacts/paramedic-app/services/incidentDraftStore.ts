import AsyncStorage from "@react-native-async-storage/async-storage";

import type { IncidentReport } from "@/models";
import * as keyManager from "./crypto/keyManager";

const KEY_PREFIX = "incident-draft-v1:";
const pendingWrites = new Map<string, Promise<void>>();

export interface IncidentDraftEnvelope {
  savedAt: string;
  payload: Partial<IncidentReport>;
}

function storageKey(userId: string, reportId: string): string {
  return `${KEY_PREFIX}${userId}:${reportId}`;
}

function enqueueWrite(key: string, write: () => Promise<void>): Promise<void> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(write);
  pendingWrites.set(key, next);
  return next.finally(() => {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  });
}

export function saveIncidentDraft(
  userId: string,
  reportId: string,
  payload: Partial<IncidentReport>,
): Promise<void> {
  const key = storageKey(userId, reportId);
  return enqueueWrite(key, async () => {
    const kek = keyManager.getKek();
    if (!kek) throw new Error("Entwurf kann ohne entsperrte Verschluesselung nicht gespeichert werden.");

    const envelope: IncidentDraftEnvelope = {
      savedAt: new Date().toISOString(),
      payload,
    };
    const ciphertext = await keyManager.encryptJson(envelope, kek);
    await AsyncStorage.setItem(key, ciphertext);
  });
}

export async function loadIncidentDraft(
  userId: string,
  reportId: string,
): Promise<IncidentDraftEnvelope | null> {
  const ciphertext = await AsyncStorage.getItem(storageKey(userId, reportId));
  if (!ciphertext) return null;

  const kek = keyManager.getKek();
  if (!kek) throw new Error("Entwurf kann erst nach dem Entsperren gelesen werden.");

  return keyManager.decryptJson<IncidentDraftEnvelope>(ciphertext, kek);
}

export function clearIncidentDraft(userId: string, reportId: string): Promise<void> {
  const key = storageKey(userId, reportId);
  return enqueueWrite(key, () => AsyncStorage.removeItem(key));
}

export async function clearIncidentDraftsForUser(userId: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const prefix = `${KEY_PREFIX}${userId}:`;
  const ownKeys = keys.filter((key) => key.startsWith(prefix));
  await Promise.all(ownKeys.map((key) => enqueueWrite(key, () => AsyncStorage.removeItem(key))));
}
