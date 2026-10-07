// Validation for the shared cargo / freight agent list.

export const cargoModes = ["Air", "Sea", "Land", "Courier"] as const;
export type CargoInput = { name: string; telephone: string; mobile: string; email: string; modes: string[]; destinations: string[]; address: string; notes: string };

const phone = (value: unknown, label: string) => {
  const text = String(value ?? "").trim();
  if (text.length > 40 || (text && !/^\+?[0-9][0-9 ()-]{5,38}$/.test(text))) throw new Error(`${label} must be a phone number such as +971501234567.`);
  return text;
};
const list = (value: unknown) => (Array.isArray(value) ? value : String(value ?? "").split(",")).map((entry) => String(entry).trim()).filter(Boolean);

/** Validated cargo details from a request payload; throws a readable message on invalid input. */
export function parseCargo(payload: Record<string, unknown>): CargoInput {
  const name = String(payload.name ?? "").trim();
  if (!name || name.length > 160) throw new Error("Enter the cargo name (up to 160 characters).");
  const email = String(payload.email ?? "").trim();
  if (email.length > 160 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new Error("Enter a valid email address.");
  const modes = [...new Set(list(payload.modes))];
  if (modes.some((mode) => !(cargoModes as readonly string[]).includes(mode))) throw new Error(`Choose shipping modes from ${cargoModes.join(", ")}.`);
  const destinations = [...new Set(list(payload.destinations))];
  if (destinations.length > 60 || destinations.some((country) => country.length > 80)) throw new Error("Keep destination countries to 60 names of up to 80 characters.");
  const address = String(payload.address ?? "").trim();
  if (address.length > 1000) throw new Error("Keep the address under 1,000 characters.");
  const notes = String(payload.notes ?? "").trim();
  if (notes.length > 2000) throw new Error("Keep the notes under 2,000 characters.");
  return { name, telephone: phone(payload.telephone, "Telephone"), mobile: phone(payload.mobile, "Mobile"), email, modes, destinations, address, notes };
}
