import { describe, it, expect, vi } from "vitest";

// R6 — Testset Anmeldewege (iserv-form)
// Mindestens: Fremdserver nicht erreichbar
//
// http/https werden gemockt -- kein echter Netzwerkzugriff. Der Mock bildet
// einen Verbindungsfehler nach (z. B. Server nicht erreichbar), wie ihn
// Node beim echten "connect ECONNREFUSED" auf das ClientRequest-Objekt
// ueber das "error"-Ereignis meldet.

const { httpRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn((_options: unknown, _callback: unknown) => {
    const req = {
      on: (event: string, handler: (err: Error) => void) => {
        if (event === "error") {
          setImmediate(() => handler(new Error("connect ECONNREFUSED 127.0.0.1:80")));
        }
        return req;
      },
      write: () => {},
      end: () => {},
    };
    return req;
  }),
}));

vi.mock("http", () => ({ request: httpRequestMock }));
vi.mock("https", () => ({ request: httpRequestMock }));

import { createIservFormProvider } from "./iservForm";

describe("iservForm-provider-tests", () => {
  it("antwortet bei unerreichbarem Fremdserver nicht als Erfolg", async () => {
    const provider = createIservFormProvider({
      key: "iserv-test",
      displayName: "IServ-Test",
      iservBaseUrl: "http://iserv.example.test",
      emailDomain: "example.test",
    });

    await expect(provider.authenticate({ username: "schueler1", password: "irgendein-passwort" })).rejects.toThrow(
      /ECONNREFUSED/,
    );
  });
});
