import { describe, expect, it } from "vitest";
import { schoolIdOf } from "../middlewares/auth";

describe("Schulkontext", () => {
  it("nimmt die Schule aus der authentifizierten Sitzung", () => {
    expect(schoolIdOf({ user: { schoolId: "school-a" } } as any)).toBe("school-a");
  });

  it("verweigert fehlenden Schulkontext statt auf eine Standard-Schule zu fallen", () => {
    expect(() => schoolIdOf({ user: {} } as any)).toThrow("Schulkontext fehlt");
  });
});
