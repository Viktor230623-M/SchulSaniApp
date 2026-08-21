import { describe, expect, it } from "vitest";
import { hasReportPlaintext, withoutReportPlaintext } from "./reportSerialization";

describe("report serialization", () => {
  it("removes every legacy plaintext field", () => {
    const report = {
      id: "report-1",
      location: "Aula",
      contentEncrypted: "ciphertext",
      title: "Notfall",
      patientFirstName: "Mira",
      patientLastName: "Muster",
      patientAge: 14,
      description: "Gesundheitsangabe",
      addendaJson: [{ text: "Nachtrag" }],
    };

    const safe = withoutReportPlaintext(report);

    expect(safe).toEqual({ id: "report-1", location: "Aula", contentEncrypted: "ciphertext" });
    expect(hasReportPlaintext(report)).toBe(true);
  });

  it("accepts a migrated report with null legacy fields", () => {
    expect(hasReportPlaintext({
      id: "report-2",
      contentEncrypted: "ciphertext",
      patientFirstName: null,
      description: null,
      addendaJson: null,
    })).toBe(false);
  });
});
