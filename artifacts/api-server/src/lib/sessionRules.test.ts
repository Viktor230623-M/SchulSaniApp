import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_LIFETIME_MS,
  SLIDING_WINDOW_MS,
  computeNewSession,
  computeSlidingExtension,
  isSessionValid,
} from "./sessionRules";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe("sessionRules — Anlegen", () => {
  it("setzt 30 Tage gleitend und 180 Tage absolut", () => {
    const s = computeNewSession(NOW);
    expect(s.expiresAt.getTime()).toBe(NOW.getTime() + days(30));
    expect(s.absoluteExpiresAt.getTime()).toBe(NOW.getTime() + days(180));
  });

  it("haelt die Konstanten konsistent", () => {
    expect(SLIDING_WINDOW_MS).toBe(days(30));
    expect(ABSOLUTE_LIFETIME_MS).toBe(days(180));
  });
});

describe("sessionRules — Gueltigkeit", () => {
  const base = {
    expiresAt: new Date(NOW.getTime() + days(10)),
    absoluteExpiresAt: new Date(NOW.getTime() + days(100)),
    revokedAt: null,
  };

  it("akzeptiert eine Sitzung innerhalb beider Fristen", () => {
    expect(isSessionValid(base, NOW)).toBe(true);
  });

  it("lehnt ab, wenn die gleitende Frist abgelaufen ist", () => {
    const s = { ...base, expiresAt: new Date(NOW.getTime() - 1) };
    expect(isSessionValid(s, NOW)).toBe(false);
  });

  it("lehnt ab, wenn die absolute Frist abgelaufen ist, obwohl die gleitende gilt", () => {
    const s = { ...base, absoluteExpiresAt: new Date(NOW.getTime() - 1) };
    expect(isSessionValid(s, NOW)).toBe(false);
  });

  it("lehnt eine widerrufene Sitzung ab", () => {
    const s = { ...base, revokedAt: new Date(NOW.getTime() - days(1)) };
    expect(isSessionValid(s, NOW)).toBe(false);
  });

  it("lehnt ab, wenn expiresAt exakt now ist", () => {
    const s = { ...base, expiresAt: new Date(NOW.getTime()) };
    expect(isSessionValid(s, NOW)).toBe(false);
  });

  it("lehnt ab, wenn absoluteExpiresAt exakt now ist", () => {
    const s = { ...base, absoluteExpiresAt: new Date(NOW.getTime()) };
    expect(isSessionValid(s, NOW)).toBe(false);
  });
});

describe("sessionRules — gleitende Verlaengerung", () => {
  it("verlaengert um 30 Tage ab jetzt", () => {
    const s = {
      expiresAt: new Date(NOW.getTime() + days(1)),
      absoluteExpiresAt: new Date(NOW.getTime() + days(100)),
      revokedAt: null,
    };
    expect(computeSlidingExtension(s, NOW).getTime()).toBe(NOW.getTime() + days(30));
  });

  it("ueberschreitet die absolute Grenze nicht", () => {
    const s = {
      expiresAt: new Date(NOW.getTime() + days(1)),
      absoluteExpiresAt: new Date(NOW.getTime() + days(5)),
      revokedAt: null,
    };
    expect(computeSlidingExtension(s, NOW).getTime()).toBe(s.absoluteExpiresAt.getTime());
  });
});
