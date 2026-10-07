// Shared search rules: case-insensitive, every typed word must appear somewhere (any order),
// e.g. "dell 16gb" finds "DELL LATITUDE 5440 | 16GB RAM".

/** The distinct words of a search, lower-cased, longest first (so highlighting prefers the longest match). */
export function searchTerms(query: string) {
  return [...new Set(query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
}

/** True when every word of the search appears in at least one of the values. An empty search matches everything. */
export function matchesSearch(values: readonly unknown[], query: string) {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const haystack = values.map((value) => value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)).join("\n").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Start/end offsets of every term in a piece of text, merged so overlapping matches become one range. */
export function matchRanges(text: string, terms: readonly string[]) {
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    for (let index = lower.indexOf(term); index !== -1; index = lower.indexOf(term, index + term.length)) ranges.push([index, index + term.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push([...range]);
  }
  return merged;
}
