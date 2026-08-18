export const PASSWORD_MIN_LENGTH = 8;

/**
 * Shared password-complexity rule, imported both client-side (for inline UX
 * feedback) and server-side (the actual security boundary, in
 * app/change-password/actions.ts) so the two can never drift apart.
 */
export function validatePasswordComplexity(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}
