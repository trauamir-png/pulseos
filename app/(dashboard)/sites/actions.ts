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

  const { error } = await supabase.from("sites").insert({
    name,
    domain,
    timezone: timezone || "UTC",
    site_key: siteKey,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/sites");
}

export async function toggleSiteActive(siteId: string, active: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("sites").update({ active }).eq("id", siteId);
  if (error) throw new Error(error.message);
  revalidatePath("/sites");
}
