import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { hasValidResendSignature } from "./webhooks";

describe("Resend webhook signatures", () => {
  const now = 1_800_000_000_000;
  const secret = "whsec_" + Buffer.from("test-webhook-secret").toString("base64");
  const body = Buffer.from('{"type":"email.bounced"}');
  const id = "msg_123";
  const timestamp = String(Math.floor(now / 1000));

  function request(signature: string) {
    return {
      rawBody: body,
      header(name: string) {
        return {
          "svix-id": id,
          "svix-timestamp": timestamp,
          "svix-signature": signature,
        }[name];
      },
    } as any;
  }

  function signature() {
    return createHmac("sha256", Buffer.from("test-webhook-secret"))
      .update(`${id}.${timestamp}.${body.toString("utf8")}`)
      .digest("base64");
  }

  beforeEach(() => {
    process.env["RESEND_WEBHOOK_SECRET"] = secret;
  });

  it("accepts a current valid v1 signature", () => {
    expect(hasValidResendSignature(request(`v1,${signature()}`), now)).toBe(true);
  });

  it("rejects a changed body and an expired timestamp", () => {
    expect(hasValidResendSignature(request(`v1,${signature().slice(1)}`), now)).toBe(false);
    expect(hasValidResendSignature(request(`v1,${signature()}`), now + 6 * 60 * 1000)).toBe(false);
  });

  it("rejects requests when the secret is not configured", () => {
    delete process.env["RESEND_WEBHOOK_SECRET"];
    expect(hasValidResendSignature(request(`v1,${signature()}`), now)).toBe(false);
  });
});
