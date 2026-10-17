// Password rules for every password a person chooses or an administrator sets (sign-in, reset link, Users & access).
// Length is what matters most (NIST SP 800-63B), so there are no "one capital, one symbol" rules: 12 to 128 characters,
// not a well-known password with numbers or symbols added, not a keyboard or number run, and not the person's own email
// or name.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

// Compared after removing digits, spaces and symbols, so "Password2026!" and "P@ssw0rd" count as "password".
const commonBases = new Set([
  "password", "passw", "pass", "passwd", "pasword", "admin", "administrator", "welcome", "letmein", "qwerty", "qwertyuiop",
  "asdfgh", "asdfghjkl", "zxcvbnm", "abc", "abcd", "abcdef", "iloveyou", "monkey", "dragon", "sunshine", "princess", "football",
  "baseball", "master", "superman", "batman", "trustno", "starwars", "shadow", "freedom", "whatever", "secret", "login",
  "changeme", "default", "test", "testing", "user", "guest", "root", "dubai", "uae", "emirates", "comnet", "easybook",
  "accounting", "accounts", "account", "company", "office", "summer", "winter", "spring", "autumn", "january", "ramadan",
]);
const runs = ["01234567890123456789", "98765432109876543210", "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba", "qwertyuiopasdfghjklzxcvbnm", "1qaz2wsx3edc4rfv5tgb"];
// Undo the usual letter swaps before comparing (P@ssw0rd → password).
const leet: Record<string, string> = { "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "0": "o", "$": "s", "5": "s", "7": "t" };

// A well-known word on its own, or with up to three extra letters (Password2026! → "password", P@ssw0rd!26 → "passwordi").
const guessable = (letters: string) => commonBases.has(letters) || [...commonBases].some((base) => base.length >= 4 && letters.includes(base) && letters.length - base.length <= 3);

/** The problem with a new password, as a sentence for the person, or null when it is acceptable. */
export function passwordProblem(password: string, person: { email?: string; fullName?: string } = {}): string | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return `The password must contain ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`;
  const lower = password.toLowerCase();
  if (new Set(lower.replace(/\s/g, "")).size < 5) return "The password repeats too few different characters. Try a few unrelated words.";
  const letters = lower.replace(/[^a-z]/g, "");
  if (!letters) return "Use some letters as well as numbers and symbols, for example a few unrelated words.";
  const unswapped = [...lower].map((character) => leet[character] ?? character).join("").replace(/[^a-z]/g, "");
  if (guessable(letters) || guessable(unswapped) || runs.some((run) => run.includes(lower.replace(/\s/g, "")))) return "This password is too easy to guess. Try a few unrelated words.";
  const local = (person.email ?? "").toLowerCase().split("@")[0].replace(/[^a-z0-9]/g, "");
  const nameParts = (person.fullName ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((part) => part.length >= 4);
  const compact = lower.replace(/[^a-z0-9]/g, "");
  if ((local.length >= 4 && compact.includes(local)) || nameParts.some((part) => compact.includes(part) && compact.replace(part, "").length < 8)) return "The password must not be based on your email address or name.";
  return null;
}
