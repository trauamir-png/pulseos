"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/permissions";
import { getSelectedSite } from "@/lib/dashboard/site";
import { validatePasswordComplexity } from "@/lib/auth/password";

/**
 * Updates the caller's own password using their own authenticated session
 * (never the admin client) so the session stays alive and no other user's
 * account can ever be touched. Only after that succeeds is
 * must_change_password cleared, and only for auth.uid() -- never a
 * client-supplied id -- via the admin client, since profiles has no
 * authenticated write policy at all.
 */
export async function changePassword(newPassword: string, confirmPassword: string): Promise<{ error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  if (newPassword !== confirmPassword) {
    return { error: "New password and confirmation do not match." };
  }

  const complexityError = validatePasswordComplexity(newPassword);
  if (complexityError) {
    return { error: complexityError };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { error: "Could not update your password. Please try again." };
  }

  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").update({ must_change_password: false }).eq("id", user.id);
  if (profileError) {
    return { error: "Your password was updated, but finishing setup failed. Please refresh and try again." };
  }

  if (await isAdmin(supabase)) {
    redirect("/");
  }

  const { site } = await getSelectedSite();
  redirect(site ? `/?site=${site.id}` : "/");
}
