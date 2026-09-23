export function normalizeComparableText(value: unknown) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function uppercaseText(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("en");
}
