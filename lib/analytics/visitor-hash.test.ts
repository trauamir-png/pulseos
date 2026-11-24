import { describe, expect, it } from "vitest";
import { getSaltDayKey } from "@/lib/analytics/visitor-hash";

describe("getSaltDayKey", () => {
  it("puts 23:50 and 00:10 Israel time on different local calendar days", () => {
    // 2026-01-15 23:50 Asia/Jerusalem (winter, UTC+2) = 2026-01-15T21:50:00Z
    const beforeMidnight = new Date("2026-01-15T21:50:00Z");
    // 2026-01-16 00:10 Asia/Jerusalem = 2026-01-15T22:10:00Z
    const afterMidnight = new Date("2026-01-15T22:10:00Z");

    expect(getSaltDayKey(beforeMidnight, "Asia/Jerusalem")).toBe("2026-01-15");
    expect(getSaltDayKey(afterMidnight, "Asia/Jerusalem")).toBe("2026-01-16");
  });

  it("keeps multiple visits on the same Israel calendar day under one key", () => {
    const morning = new Date("2026-01-15T06:00:00Z"); // 08:00 local
    const noon = new Date("2026-01-15T11:00:00Z"); // 13:00 local
    const evening = new Date("2026-01-15T20:00:00Z"); // 22:00 local

    const key = getSaltDayKey(morning, "Asia/Jerusalem");
    expect(getSaltDayKey(noon, "Asia/Jerusalem")).toBe(key);
    expect(getSaltDayKey(evening, "Asia/Jerusalem")).toBe(key);
  });

  it("matches plain UTC-date behavior for a UTC-timezone site (no regression)", () => {
    const midday = new Date("2026-01-15T12:00:00Z");
    const nearMidnight = new Date("2026-01-15T23:30:00Z");

    expect(getSaltDayKey(midday, "UTC")).toBe("2026-01-15");
    expect(getSaltDayKey(nearMidnight, "UTC")).toBe("2026-01-15");
  });

  it("resolves the correct local day across Israel's DST fall-back transition", () => {
    // Israel's 2025 DST ends Sunday 2025-10-26 02:00 IDT (UTC+3) -> 01:00 IST (UTC+2),
    // i.e. the UTC instant 2025-10-25T23:00:00Z. Two UTC timestamps exactly 24h apart
    // straddle that transition, so they sit on opposite sides of the +3 / +2 switch.

    // Before the transition: 2025-10-25T21:30:00Z at UTC+3 -> 2025-10-26 00:30 local.
    const beforeTransition = new Date("2025-10-25T21:30:00Z");
    // After the transition: 2025-10-26T21:30:00Z at UTC+2 -> 2025-10-26 23:30 local.
    // A hardcoded UTC+3 offset would wrongly compute 2025-10-27T00:30 here (wrong day).
    const afterTransition = new Date("2025-10-26T21:30:00Z");

    expect(getSaltDayKey(beforeTransition, "Asia/Jerusalem")).toBe("2025-10-26");
    expect(getSaltDayKey(afterTransition, "Asia/Jerusalem")).toBe("2025-10-26");
  });
});
