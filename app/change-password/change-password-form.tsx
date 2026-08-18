"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "./actions";
import { validatePasswordComplexity } from "@/lib/auth/password";

export function ChangePasswordForm() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) {
      setError(complexityError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    startTransition(async () => {
      const result = await changePassword(newPassword, confirmPassword);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>
      <ul className="space-y-1 rounded-lg bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
        <li>At least 8 characters</li>
        <li>At least one uppercase letter</li>
        <li>At least one lowercase letter</li>
        <li>At least one number</li>
      </ul>
      {error && <p className="text-sm text-[var(--negative)]">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
