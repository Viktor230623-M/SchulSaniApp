import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, authTokensTable, type AuthTokenKind } from "@workspace/db";

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueAuthToken(
  userId: string,
  kind: AuthTokenKind,
  expiresAt: Date,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(authTokensTable).values({
    id: randomUUID(),
    userId,
    kind,
    tokenHash: hashAuthToken(token),
    expiresAt,
  });
  return token;
}
