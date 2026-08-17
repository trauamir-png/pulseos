"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/permissions";

/** Settings is Admin-only for this phase -- see Phase 2 report Section 9. */
async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!(await isAdmin(supabase))) throw new Error("Admin access required.");
}

export async function addConversionEvent(formData: FormData) {
  const siteId = String(formData.get("siteId") || "");
  const eventName = String(formData.get("eventName") || "").trim();
  if (!siteId || !eventName) throw new Error("Event name is required.");

  const supabase = await createClient();
  await requireAdmin(supabase);
  const { error } = await supabase.from("site_conversion_events").insert({ site_id: siteId, event_name: eventName });
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function removeConversionEvent(siteId: string, eventName: string) {
  const supabase = await createClient();
  await requireAdmin(supabase);
  const { error } = await supabase
    .from("site_conversion_events")
    .delete()
    .eq("site_id", siteId)
    .eq("event_name", eventName);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
