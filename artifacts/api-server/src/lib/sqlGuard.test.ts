import { describe, expect, it } from "vitest";
import { guardStatement } from "./sqlGuard";
import { PATIENT_COLUMNS } from "./patientColumns";

describe("sqlGuard — Patientenfelder", () => {
  it("sperrt lesenden Zugriff auf incident_reports", () => {
    const r = guardStatement("SELECT id, status FROM incident_reports");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("incident_reports_admin");
  });

  it("erlaubt die redigierte Sicht", () => {
    const r = guardStatement("SELECT id, status FROM incident_reports_admin");
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("read");
  });

  it("sperrt jedes einzelne Patientenfeld", () => {
    for (const column of PATIENT_COLUMNS) {
      const r = guardStatement(`SELECT ${column} FROM incident_reports_admin`);
      expect(r.ok, `${column} muss gesperrt sein`).toBe(false);
      expect(r.error).toContain(column);
    }
  });

  it("sperrt Patientenfelder auch in der WHERE-Klausel eines DELETE", () => {
    // Wuerde sonst per Ausprobieren verraten, wer wann versorgt wurde.
    const r = guardStatement("DELETE FROM incident_reports WHERE patient_last_name = 'Meier'");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("patient_last_name");
  });

  it("erlaubt Loeschen ueber die Protokoll-ID", () => {
    const r = guardStatement("DELETE FROM incident_reports WHERE id = 'abc'");
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("write");
  });

  it("sperrt RETURNING, das die geloeschte Zeile zurueckgeben wuerde", () => {
    const r = guardStatement("DELETE FROM incident_reports WHERE id = 'abc' RETURNING *");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("RETURNING");
  });

  it("laesst sich nicht durch einen CTE umgehen", () => {
    const r = guardStatement(
      "WITH x AS (SELECT * FROM incident_reports) SELECT * FROM x"
    );
    expect(r.ok).toBe(false);
  });

  it("laesst sich nicht durch einen JOIN umgehen", () => {
    const r = guardStatement(
      "SELECT m.id FROM missions m JOIN incident_reports r ON r.mission_id = m.id"
    );
    expect(r.ok).toBe(false);
  });

  it("verwechselt Feldnamen in Textwerten nicht mit echten Feldern", () => {
    // 'outcome' steckt hier in Daten, nicht in der Anweisung.
    const r = guardStatement("SELECT id FROM missions WHERE title = 'outcome unklar'");
    expect(r.ok).toBe(true);
  });
});

describe("sqlGuard — bestehende Regeln bleiben wirksam", () => {
  it("sperrt DROP", () => {
    expect(guardStatement("DROP TABLE users").ok).toBe(false);
  });

  it("markiert UPDATE ohne WHERE als unbegrenzt", () => {
    const r = guardStatement("UPDATE missions SET status = 'open'");
    expect(r.ok).toBe(true);
    expect(r.unbounded).toBe(true);
  });

  it("sperrt mehrere Anweisungen in einer Ausfuehrung", () => {
    expect(guardStatement("SELECT 1; DELETE FROM users").ok).toBe(false);
  });
});
