"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createSite(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const domainInput = String(formData.get("domain") || "").trim().toLowerCase();
  const domain = domainInput || null;
  const timezone = String(formData.get("timezone") || "UTC").trim();

  if (!name) {
    throw new Error("Name is required.");
  }

  const supabase = await createClient();
  const siteKey = randomBytes(16).toString("hex");

  const { data: site, error } = await supabase
    .from("sites")
    .insert({
      name,
      domain,
      timezone: timezone || "UTC",
      site_key: siteKey,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  // Domain-less sites are podcast-only: Web Analytics needs a domain, so it starts inactive.
  await supabase.from("site_modules").insert([
    { site_id: site.id, module_key: "web_analytics", active: domain != null },
    { site_id: site.id, module_key: "podcast_analytics", active: domain == null },
  ]);

  revalidatePath("/sites");
}

export async function toggleSiteActive(siteId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("sites").update({ active }).eq("id", siteId);
  if (error) throw new Error(error.message);
  revalidatePath("/sites");
}

export async function setSiteDomain(siteId: string, domain: string) {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) throw new Error("Domain is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("sites").update({ domain: trimmed }).eq("id", siteId);
  if (error) throw new Error(error.message);
  revalidatePath("/sites");
}

export async function toggleSiteModule(siteId: string, moduleKey: string, active: boolean) {
  const supabase = await createClient();

  if (moduleKey === "web_analytics" && active) {
    const { data: site, error: siteError } = await supabase.from("sites").select("domain").eq("id", siteId).single();
    if (siteError) throw new Error(siteError.message);
    if (!site.domain) throw new Error("Add a domain to this site before enabling Web Analytics.");
  }

  const { error } = await supabase
    .from("site_modules")
    .upsert({ site_id: siteId, module_key: moduleKey, active, updated_at: new Date().toISOString() }, { onConflict: "site_id,module_key" });
  if (error) throw new Error(error.message);
  revalidatePath("/sites");
}
