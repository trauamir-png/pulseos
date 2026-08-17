import { describe, expect, it, vi, beforeEach } from "vitest";
import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permission-definitions";

/**
 * Phase 2 spec Section 14 "Columns permission matrix" + "Content management
 * action permission rejection": exercises the real Server Actions in
 * app/(dashboard)/content/actions.ts against a mocked Supabase client, so
 * these assert the actual enforcement code path (requireSiteAccess /
 * requirePermission / ownership check), not a reimplementation of it.
 *
 * next/cache's revalidatePath() and @/lib/supabase/server's createClient()
 * both assume a live Next.js request context that doesn't exist under
 * Vitest's node environment, so both are mocked here.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

interface MockState {
  isAdmin: boolean;
  userId: string | null;
  profileActive: boolean;
  accessibleSiteIds: string[];
  siteId: string;
  permissions: Set<PermissionKey>;
  columns: Record<string, { status: string; created_by: string | null; site_id: string }>;
}

function makeSupabase(state: MockState) {
  function builder(table: string) {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "insert" | "update" | "delete" = "select";

    function resolve() {
      if (table === "profiles" && mode === "select") {
        if (!state.userId) return Promise.resolve({ data: null, error: null });
        return Promise.resolve({
          data: { id: state.userId, display_name: "Test User", active: state.profileActive, is_admin: state.isAdmin },
          error: null,
        });
      }
      if (table === "columns" && mode === "select") {
        const id = filters.id as string | undefined;
        const row = id ? state.columns[id] : undefined;
        if (row && (!filters.site_id || row.site_id === filters.site_id)) {
          return Promise.resolve({ data: { status: row.status, created_by: row.created_by }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }
      if (mode === "insert") return Promise.resolve({ data: { id: "new-id", public_url: "https://example.com/media/x.png" }, error: null });
      if (mode === "update") return Promise.resolve({ data: null, error: null });
      if (mode === "delete") return Promise.resolve({ data: [{ id: (filters.id as string) ?? "deleted-id" }], error: null });
      // Fallback select (e.g. uniqueSlug's existence check): nothing found, slug is free.
      return Promise.resolve({ data: null, error: null });
    }

    const api = {
      select: () => api,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return api;
      },
      neq: () => api,
      in: () => api,
      ilike: () => api,
      order: () => api,
      insert: () => {
        mode = "insert";
        return api;
      },
      update: () => {
        mode = "update";
        return api;
      },
      upsert: () => {
        mode = "insert";
        return api;
      },
      delete: () => {
        mode = "delete";
        return api;
      },
      maybeSingle: () => resolve(),
      single: () => resolve(),
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => resolve().then(onFulfilled, onRejected),
    };
    return api;
  }

  return {
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null } }) },
    rpc: async (name: string, args?: Record<string, unknown>) => {
      if (name === "is_admin") return { data: state.isAdmin, error: null };
      if (name === "accessible_site_ids") return { data: state.accessibleSiteIds, error: null };
      if (name === "has_permission") {
        if (state.isAdmin) return { data: true, error: null };
        if (args?.p_site_id !== state.siteId) return { data: false, error: null };
        return { data: state.permissions.has(args?.p_permission as PermissionKey), error: null };
      }
      return { data: null, error: { message: `unhandled rpc ${name}` } };
    },
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://example.com/media/x.png" } }),
        remove: async () => ({ error: null }),
      }),
    },
  };
}

let currentSupabase: ReturnType<typeof makeSupabase>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabase,
}));

const SITE_A = "site-a";
const SITE_B = "site-b";
const WRITER_ID = "writer-1";
const OTHER_WRITER_ID = "writer-2";

function baseState(overrides: Partial<MockState> = {}): MockState {
  return {
    isAdmin: false,
    userId: WRITER_ID,
    profileActive: true,
    accessibleSiteIds: [SITE_A],
    siteId: SITE_A,
    permissions: new Set(),
    columns: {},
    ...overrides,
  };
}

let actions: typeof import("./actions");

beforeEach(async () => {
  vi.resetModules();
  actions = await import("./actions");
});

const validColumnInput = {
  title: "Test column",
  subtitle: "",
  slug: "",
  body: "<p>hello</p>",
  featuredImageId: null,
  authorId: "author-1",
  categoryId: "category-1",
  tags: [],
  seoTitle: "",
  metaDescription: "",
  ogImageId: null,
};

describe("createColumn", () => {
  it("is denied without content.columns.create", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set() }));
    await expect(actions.createColumn(SITE_A, validColumnInput)).rejects.toThrow();
  });

  it("succeeds when content.columns.create is granted", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_CREATE]) }));
    await expect(actions.createColumn(SITE_A, validColumnInput)).resolves.toEqual({ id: "new-id" });
  });

  it("is denied for a site the user has no membership on, even with create granted on their own site", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_CREATE]) }));
    await expect(actions.createColumn(SITE_B, validColumnInput)).rejects.toThrow();
  });

  it("Admin bypasses both the membership check and the permission check", async () => {
    currentSupabase = makeSupabase(baseState({ isAdmin: true, accessibleSiteIds: [], permissions: new Set() }));
    await expect(actions.createColumn(SITE_B, validColumnInput)).resolves.toEqual({ id: "new-id" });
  });
});

describe("updateColumn -- ownership matrix", () => {
  const columns = {
    "col-own": { status: "draft", created_by: WRITER_ID, site_id: SITE_A },
    "col-other": { status: "draft", created_by: OTHER_WRITER_ID, site_id: SITE_A },
  };

  it("edit_own lets a writer edit their own column", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN]), columns }));
    await expect(actions.updateColumn(SITE_A, "col-own", validColumnInput)).resolves.toBeUndefined();
  });

  it("edit_own does NOT let a writer edit someone else's column", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_EDIT_OWN]), columns }));
    await expect(actions.updateColumn(SITE_A, "col-other", validColumnInput)).rejects.toThrow();
  });

  it("edit_all lets a writer edit a column they don't own", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL]), columns }));
    await expect(actions.updateColumn(SITE_A, "col-other", validColumnInput)).resolves.toBeUndefined();
  });

  it("neither edit_own nor edit_all denies editing even your own column", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set(), columns }));
    await expect(actions.updateColumn(SITE_A, "col-own", validColumnInput)).rejects.toThrow();
  });

  it("Admin can edit any column without edit_own/edit_all granted", async () => {
    currentSupabase = makeSupabase(baseState({ isAdmin: true, accessibleSiteIds: [], permissions: new Set(), columns }));
    await expect(actions.updateColumn(SITE_A, "col-other", validColumnInput)).resolves.toBeUndefined();
  });

  it("cross-site: a column that exists on Site B cannot be updated by scoping the call to Site A", async () => {
    currentSupabase = makeSupabase(
      baseState({
        permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_EDIT_ALL]),
        columns: { "col-b": { status: "draft", created_by: WRITER_ID, site_id: SITE_B } },
      }),
    );
    await expect(actions.updateColumn(SITE_A, "col-b", validColumnInput)).rejects.toThrow("Column not found.");
  });
});

describe("setColumnStatus -- publish / schedule", () => {
  const draftColumn = { "col-1": { status: "draft", created_by: WRITER_ID, site_id: SITE_A } };

  it("publishing is denied without content.columns.publish", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set(), columns: draftColumn }));
    await expect(actions.setColumnStatus(SITE_A, "col-1", "published")).rejects.toThrow();
  });

  it("publishing succeeds with content.columns.publish", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_PUBLISH]), columns: draftColumn }));
    await expect(actions.setColumnStatus(SITE_A, "col-1", "published")).resolves.toBeUndefined();
  });

  it("scheduling is denied without content.columns.schedule", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set(), columns: draftColumn }));
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await expect(actions.setColumnStatus(SITE_A, "col-1", "scheduled", future)).rejects.toThrow();
  });

  it("scheduling succeeds with content.columns.schedule", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_SCHEDULE]), columns: draftColumn }));
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await expect(actions.setColumnStatus(SITE_A, "col-1", "scheduled", future)).resolves.toBeUndefined();
  });

  it("reverting a published column back to draft still requires content.columns.publish", async () => {
    currentSupabase = makeSupabase(
      baseState({ permissions: new Set(), columns: { "col-1": { status: "published", created_by: WRITER_ID, site_id: SITE_A } } }),
    );
    await expect(actions.setColumnStatus(SITE_A, "col-1", "draft")).rejects.toThrow();
  });
});

describe("deleteColumn", () => {
  it("is denied without content.columns.delete", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set(), columns: { "col-1": { status: "draft", created_by: WRITER_ID, site_id: SITE_A } } }));
    await expect(actions.deleteColumn(SITE_A, "col-1")).rejects.toThrow();
  });

  it("succeeds with content.columns.delete", async () => {
    currentSupabase = makeSupabase(
      baseState({ permissions: new Set([PERMISSIONS.CONTENT_COLUMNS_DELETE]), columns: { "col-1": { status: "draft", created_by: WRITER_ID, site_id: SITE_A } } }),
    );
    await expect(actions.deleteColumn(SITE_A, "col-1")).resolves.toBeUndefined();
  });
});

describe("content management actions -- permission rejection", () => {
  const authorInput = {
    name: "Jane Doe",
    slug: "",
    profileImageId: null,
    shortBio: "",
    fullBio: "",
    email: "",
    socialLinks: {},
    active: true,
  };
  const categoryInput = { name: "News", slug: "", description: "", active: true };
  const bannerInput = {
    internalName: "Homepage hero",
    desktopImageId: "media-1",
    mobileImageId: null,
    title: "",
    subtitle: "",
    ctaText: "",
    destinationUrl: "",
    placement: "home_hero" as const,
    active: true,
    startAt: null,
    endAt: null,
    sortOrder: 0,
  };

  it("createAuthor rejects without content.authors.manage, allows with it", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set() }));
    await expect(actions.createAuthor(SITE_A, authorInput)).rejects.toThrow();

    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_AUTHORS_MANAGE]) }));
    await expect(actions.createAuthor(SITE_A, authorInput)).resolves.toBeUndefined();
  });

  it("createCategory rejects without content.categories.manage, allows with it", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set() }));
    await expect(actions.createCategory(SITE_A, categoryInput)).rejects.toThrow();

    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_CATEGORIES_MANAGE]) }));
    await expect(actions.createCategory(SITE_A, categoryInput)).resolves.toBeUndefined();
  });

  it("createBanner rejects without content.banners.manage, allows with it", async () => {
    currentSupabase = makeSupabase(baseState({ permissions: new Set() }));
    await expect(actions.createBanner(SITE_A, bannerInput)).rejects.toThrow();

    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_BANNERS_MANAGE]) }));
    await expect(actions.createBanner(SITE_A, bannerInput)).resolves.toBeUndefined();
  });

  it("uploadMedia rejects without content.media.manage, allows with it", async () => {
    const formData = new FormData();
    formData.set("file", new File(["fake-bytes"], "photo.png", { type: "image/png" }));

    currentSupabase = makeSupabase(baseState({ permissions: new Set() }));
    await expect(actions.uploadMedia(SITE_A, formData)).rejects.toThrow();

    currentSupabase = makeSupabase(baseState({ permissions: new Set([PERMISSIONS.CONTENT_MEDIA_MANAGE]) }));
    await expect(actions.uploadMedia(SITE_A, formData)).resolves.toEqual({ id: "new-id", publicUrl: "https://example.com/media/x.png" });
  });

  it("an inactive profile is denied even with every permission granted (fails closed)", async () => {
    currentSupabase = makeSupabase(baseState({ profileActive: false, permissions: new Set([PERMISSIONS.CONTENT_AUTHORS_MANAGE]) }));
    await expect(actions.createAuthor(SITE_A, authorInput)).rejects.toThrow();
  });
});
