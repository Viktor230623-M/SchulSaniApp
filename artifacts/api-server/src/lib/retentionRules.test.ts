import { describe, expect, it } from "vitest";
import { computeCutoffs } from "./retentionRules";

describe("computeCutoffs", () => {
  const now = new Date("2026-07-19T10:00:00Z");
  const cutoffs = computeCutoffs(now);

  it("loescht eingereichte Protokolle 5 Jahre nach Jahresende", () => {
    expect(cutoffs.reportsSubmitted.toISOString()).toBe("2020-12-31T23:59:59.999Z");
  });

  it("loescht Entwuerfe nach 30 Tagen", () => {
    expect(cutoffs.reportsDraft.toISOString()).toBe("2026-06-19T10:00:00.000Z");
  });

  it("loescht Einsaetze ohne Protokoll nach 12 Monaten", () => {
    expect(cutoffs.missions.toISOString()).toBe("2025-07-19T10:00:00.000Z");
  });

  it("loescht Benachrichtigungen nach 90 Tagen", () => {
    expect(cutoffs.notifications.toISOString()).toBe("2026-04-20T10:00:00.000Z");
  });

  it("loescht Konsolen- und Zugriffsprotokolle nach 12 Monaten", () => {
    expect(cutoffs.consoleLog.toISOString()).toBe("2025-07-19T10:00:00.000Z");
    expect(cutoffs.accessLog.toISOString()).toBe("2025-07-19T10:00:00.000Z");
  });

  it("loescht das Protokoll der Rollenaenderungen nach 12 Monaten", () => {
    expect(cutoffs.roleChangeLog.toISOString()).toBe("2025-07-19T10:00:00.000Z");
  });

  it("loescht das Protokoll der Namenskorrekturen nach 12 Monaten", () => {
    expect(cutoffs.profileChangeLog.toISOString()).toBe("2025-07-19T10:00:00.000Z");
  });

  it("loescht das Protokoll der Kontoverknuepfungen nach 12 Monaten", () => {
    expect(cutoffs.identityChangeLog.toISOString()).toBe("2025-07-19T10:00:00.000Z");
  });

  it("haelt Abwesenheitsantraege und Einsatzhistorie 24 Monate", () => {
    expect(cutoffs.loa.toISOString()).toBe("2024-07-19T10:00:00.000Z");
    expect(cutoffs.activityLogAnonymize.toISOString()).toBe("2024-07-19T10:00:00.000Z");
  });

  it("loescht widerrufene Sitzungen nach 30 Tagen", () => {
    expect(cutoffs.sessionsRevoked.toISOString()).toBe("2026-06-19T10:00:00.000Z");
  });
});
