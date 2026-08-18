import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-lg font-semibold text-white">
            P
          </div>
          <h1 className="text-xl font-semibold text-[var(--foreground)]">Set a new password</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            You&rsquo;re signing in for the first time. Choose a permanent password to continue into PulseOS.
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
