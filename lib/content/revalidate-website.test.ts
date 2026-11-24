import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { revalidateWebsite } from "./revalidate-website";

function makeSupabase(domain: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: domain ? { domain } : null, error: null }),
        }),
      }),
    }),
  } as never;
}

describe("revalidateWebsite", () => {
  const originalSecret = process.env.WEBSITE_REVALIDATE_SECRET;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.WEBSITE_REVALIDATE_SECRET = originalSecret;
  });

  it("no-ops without throwing and returns false when the secret env var is not configured", async () => {
    delete process.env.WEBSITE_REVALIDATE_SECRET;
    await expect(revalidateWebsite(makeSupabase("example.com"), "site-1", ["stand-media"])).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("no-ops without throwing and returns false when the site has no domain", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    await expect(revalidateWebsite(makeSupabase(null), "site-1", ["stand-media"])).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the tags with the secret header to the site's /api/revalidate, normalizing a bare domain to https, and returns true on a 2xx response", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    await expect(revalidateWebsite(makeSupabase("example.com"), "site-1", ["stand-media"])).resolves.toBe(true);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/api/revalidate");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-revalidate-secret"]).toBe("test-secret");
    expect(JSON.parse(init.body as string)).toEqual({ tags: ["stand-media"] });
  });

  it("returns false (without throwing or leaking the secret) on a non-2xx HTTP response", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })),
    );

    await expect(revalidateWebsite(makeSupabase("example.com"), "site-1", ["status-snapshot"])).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls[0].map(String).join(" ");
    expect(loggedArgs).not.toContain("test-secret");
    errorSpy.mockRestore();
  });

  it("swallows a network error instead of throwing and returns false, without leaking the secret", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    await expect(revalidateWebsite(makeSupabase("example.com"), "site-1", ["stand-media"])).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const loggedArgs = errorSpy.mock.calls[0].map(String).join(" ");
    expect(loggedArgs).not.toContain("test-secret");
    errorSpy.mockRestore();
  });

  it("swallows a timeout/abort instead of throwing and returns false", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );

    await expect(revalidateWebsite(makeSupabase("example.com"), "site-1", ["status-snapshot"])).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
