import { describe, expect, it, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { isAuthorized } from "./route";

function makeRequest(headerValue: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "x-telegram-bot-api-secret-token" ? headerValue : null) },
  } as unknown as NextRequest;
}

describe("isAuthorized", () => {
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret;
  });

  it("2. wrong secret -> rejected", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "correct-secret";
    expect(isAuthorized(makeRequest("wrong-secret"))).toBe(false);
  });

  it("3. missing secret header -> rejected", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "correct-secret";
    expect(isAuthorized(makeRequest(null))).toBe(false);
  });

  it("rejects when TELEGRAM_WEBHOOK_SECRET itself is not configured, even with a header present", () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect(isAuthorized(makeRequest("anything"))).toBe(false);
  });

  it("accepts the exact configured secret", () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = "correct-secret";
    expect(isAuthorized(makeRequest("correct-secret"))).toBe(true);
  });
});
