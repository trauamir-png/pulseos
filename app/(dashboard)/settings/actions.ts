"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addConversionEvent(formData: FormData) {
  const siteId = String(formData.get("siteId") || "");
  const eventName = String(formData.get("eventName") || "").trim();
  if (!siteId || !eventName) throw new Error("Event name is required.");

  const supabase = await createClient();
  const { error } = await supabase.from("site_conversion_events").insert({ site_id: siteId, event_name: eventName });
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function removeConversionEvent(siteId: string, eventName: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_conversion_events")
    .delete()
    .eq("site_id", siteId)
    .eq("event_name", eventName);
  if (error) throw new Error(error.message);
  revalidatePath("/settings");
}
