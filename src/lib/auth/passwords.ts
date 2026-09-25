/**
 * Shared by server code, the container scripts (scripts/bootstrap.ts,
 * scripts/reset-password.ts) and browser forms, so it uses only Web Crypto
 * and must not import Next, Node built-ins or `env()`.
 */

/** Minimum for any password a person chooses. Generated ones are longer. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * The first-run admin gets an address here until they set a real one. The
 * `.invalid` TLD is reserved (RFC 2606), so it can never collide with a real
 * mailbox, and the app can tell a placeholder from a real address.
 */
export const PLACEHOLDER_EMAIL_DOMAIN = "rickhouse.invalid";

export function isPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/**
 * No 0/O, 1/l/I: generated passwords get read out of container logs and
 * typed by hand.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUP = 6;
const GROUPS = 4;

/**
 * Uniform index into ALPHABET. Values from the top sliver of the 32-bit range
 * are redrawn, since keeping them would make the first few characters of the
 * alphabet slightly more likely.
 */
function randomIndex(): number {
  const limit = Math.floor(0x1_0000_0000 / ALPHABET.length) * ALPHABET.length;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] as number;
    if (value < limit) return value % ALPHABET.length;
  }
}

/**
 * Four dash-separated groups of six, e.g. `k7Qm2x-Hs9pRt-...`: about 140 bits
 * of entropy from a CSPRNG, and still easy to transcribe. Only ever used as a
 * temporary password; the holder is made to choose their own on first use.
 */
export function generatePassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = "";
    for (let i = 0; i < GROUP; i += 1) group += ALPHABET[randomIndex()];
    groups.push(group);
  }
  return groups.join("-");
}

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}
