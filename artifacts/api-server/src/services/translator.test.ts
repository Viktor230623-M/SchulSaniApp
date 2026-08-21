import { describe, expect, it, vi } from "vitest";
import { localTranslationUrl, translateToLanguages } from "./translator";

describe("translator boundary", () => {
  it("rejects external translation hosts", () => {
    expect(localTranslationUrl("https://translate.example/")).toBeNull();
    expect(localTranslationUrl("https://libretranslate.school.example")).toBeNull();
  });

  it("accepts loopback hosts and removes a trailing slash", () => {
    expect(localTranslationUrl("http://127.0.0.1:5000/")).toBe("http://127.0.0.1:5000");
    expect(localTranslationUrl("http://localhost:5000")).toBe("http://localhost:5000");
  });

  it("fails closed for malformed configuration", () => {
    expect(localTranslationUrl("not a URL")).toBeNull();
    expect(localTranslationUrl(undefined)).toBe("http://127.0.0.1:5000");
  });

  it("does not send text to an external host", async () => {
    const previous = process.env["LIBRETRANSLATE_URL"];
    const fetchMock = vi.fn();
    process.env["LIBRETRANSLATE_URL"] = "https://translate.example";
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(translateToLanguages({ description: "Mira" }, "de")).resolves.toEqual({});
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env["LIBRETRANSLATE_URL"];
      else process.env["LIBRETRANSLATE_URL"] = previous;
      vi.unstubAllGlobals();
    }
  });
});
