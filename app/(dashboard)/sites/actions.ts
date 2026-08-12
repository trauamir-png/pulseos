"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createSite(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const domain = String(formData.get("domain") || "").trim().toLowerCase();
  const timezone = String(formData.get("timezone") || "UTC").trim();

  if (!name || !domain) {
    throw new Error("Name and domain are required.");
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

  await supabase.from("site_modules").insert([
    { site_id: site.id, module_key: "web_analytics", active: true },
    { site_id: site.id, module_key: "podcast_analytics", active: false },
  ]);

  revalidatePath("/sites");
}

export async function toggleSiteActive(siteId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("sites").update({ active }).eq("id", siteId);
  if (error) throw new Error(error.message);
  revalidatePath("/sites");
}

export async function toggleSiteModule(siteId: string, moduleKey: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_modules")
    .upsert({ site_id: siteId, module_key: moduleKey, active, updated_at: new Date().toISOString() }, { onConflict: "site_id,module_key" });
  if (error) throw new Error(error.message);
  revalidatePath("/sites");
}
