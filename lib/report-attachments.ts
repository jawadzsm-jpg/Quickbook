export function reportAttachmentId(reportKey = "") {
  let hash = 2166136261;
  for (const character of reportKey) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 1) || 1;
}
