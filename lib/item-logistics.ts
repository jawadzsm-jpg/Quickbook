export type LogisticsOption = { id?: number; type: "hs_code" | "coo"; value: string; label: string };
export const defaultHsCodes: LogisticsOption[] = [
  ["84713000", "Laptop / Notebook"], ["84714100", "Desktop Computer"],
  ["84717000", "HDD & RAM / Storage"], ["85235100", "SSD / Solid-State Storage"],
  ["85285200", "Computer Monitor"], ["84433100", "Printer / Multifunction"],
  ["84716000", "Keyboard & Mouse"], ["85183000", "Headphones / Speakers"],
  ["85044090", "Power Adapter / Charger"],
].map(([value, label]) => ({ type: "hs_code", value, label }));

/** Numeric dimensions are authoritative once all three measurements are present. */
export function dimensionText(length: unknown, width: unknown, height: unknown, fallback = "") {
  const values = [length, width, height].map(Number);
  return values.every(value => Number.isFinite(value) && value > 0 && value <= 1_000_000)
    ? `${values.join(" × ")} cm` : fallback;
}
