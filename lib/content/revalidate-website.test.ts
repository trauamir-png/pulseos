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

  it("no-ops without throwing when the secret env var is not configured", async () => {
    delete process.env.WEBSITE_REVALIDATE_SECRET;
    await expect(revalidateWebsite(makeSupabase("example.com"), "site-1", ["stand-media"])).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("no-ops without throwing when the site has no domain", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    await expect(revalidateWebsite(makeSupabase(null), "site-1", ["stand-media"])).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the tags with the secret header to the site's /api/revalidate, normalizing a bare domain to https", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    await revalidateWebsite(makeSupabase("example.com"), "site-1", ["stand-media"]);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.com/api/revalidate");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-revalidate-secret"]).toBe("test-secret");
    expect(JSON.parse(init.body as string)).toEqual({ tags: ["stand-media"] });
  });

  it("swallows a failed fetch instead of throwing", async () => {
    process.env.WEBSITE_REVALIDATE_SECRET = "test-secret";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(revalidateWebsite(makeSupabase("example.com"), "site-1", ["stand-media"])).resolves.toBeUndefined();
  });
});
