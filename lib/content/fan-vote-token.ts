import { createHmac } from "crypto";

/**
 * One-way voter identity for anonymous fan voting. `rawToken` is an opaque
 * random value Hakol's public site generates and keeps in a first-party
 * cookie -- PulseOS never sees or stores it, only this hash. `pollId` is
 * folded into the HMAC input (not just used as the lookup key) so the same
 * physical visitor's hash is unlinkable across different polls -- a stricter
 * privacy bar than the bare minimum needed for the (poll_id, voter_hash)
 * unique constraint.
 *
 * Deliberately not lib/analytics/visitor-hash.ts's daily-rotating salt: a
 * poll's "one vote per voter" constraint must hold for the poll's entire
 * active lifetime, not reset at UTC midnight.
 */
export function computeVoterHash(pollId: string, rawToken: string): string {
  const secret = process.env.MATCH_FAN_VOTE_TOKEN_SECRET;
  if (!secret) {
    throw new Error("MATCH_FAN_VOTE_TOKEN_SECRET is not configured.");
  }
  return createHmac("sha256", secret).update(`${pollId}|${rawToken}`).digest("hex");
}
