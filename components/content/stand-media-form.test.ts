import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTitleValidationError, toFriendlyErrorMessage } from "./stand-media-form";

describe("getTitleValidationError", () => {
  it("blocks save with the Hebrew message when title is empty", () => {
    expect(getTitleValidationError("")).toBe("יש להזין כותרת");
  });

  it("blocks save when title is only whitespace", () => {
    expect(getTitleValidationError("   ")).toBe("יש להזין כותרת");
  });

  it("allows save when title is provided", () => {
    expect(getTitleValidationError("מהיציע")).toBeNull();
  });
});

describe("toFriendlyErrorMessage", () => {
  it("passes through a clean business error message", () => {
    expect(toFriendlyErrorMessage(new Error("A TikTok video URL is required."))).toBe(
      "A TikTok video URL is required."
    );
  });

  it("replaces an opaque React/RSC digest-style message with a normal form error", () => {
    expect(toFriendlyErrorMessage(new Error("An error occurred in the Server Components render."))).toBe(
      "אירעה שגיאה בשמירה. נסו שוב."
    );
  });

  it("falls back to a generic message for non-Error throws", () => {
    expect(toFriendlyErrorMessage("boom")).toBe("אירעה שגיאה בשמירה. נסו שוב.");
  });
});

describe("stand-media-441 diagnostics removed", () => {
  const root = join(__dirname, "..", "..");
  const files = [
    "app/(dashboard)/content/actions.ts",
    "lib/dashboard/content-stand-media.ts",
    "app/(dashboard)/content/stand-media/[id]/page.tsx",
    "components/content/stand-media-form.tsx",
  ];

  it.each(files)("%s no longer contains [stand-media-441] diagnostics", (relativePath) => {
    const contents = readFileSync(join(root, relativePath), "utf8");
    expect(contents).not.toContain("stand-media-441");
  });
});
