import { base64ToArrayBuffer } from "./keys";

// Generate a numeric safety number from two users' identity keys.
// SHA-256 of sorted concatenated identity keys → groups of 5 digits.

export async function generateSafetyNumber(
  identityKeyA: string,
  identityKeyB: string
): Promise<string> {
  // Sort so both sides produce the same result
  const sorted = [identityKeyA, identityKeyB].sort();

  const bufA = base64ToArrayBuffer(sorted[0]!);
  const bufB = base64ToArrayBuffer(sorted[1]!);

  const combined = new Uint8Array(bufA.byteLength + bufB.byteLength);
  combined.set(new Uint8Array(bufA), 0);
  combined.set(new Uint8Array(bufB), bufA.byteLength);

  const hash = await crypto.subtle.digest("SHA-256", combined);
  const bytes = new Uint8Array(hash);

  // Convert to groups of 5 digits (12 groups = 60 digits)
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    // Use 2 bytes per group, mod 100000 for 5 digits
    const offset = (i * 2) % bytes.length;
    const value =
      ((bytes[offset]! << 8) | bytes[(offset + 1) % bytes.length]!) % 100000;
    groups.push(value.toString().padStart(5, "0"));
  }

  return groups.join(" ");
}
