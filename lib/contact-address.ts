type ContactAddress = { addressLine1?: unknown; addressLine2?: unknown; city?: unknown; region?: unknown; postalCode?: unknown; country?: unknown };

const text = (value: unknown) => String(value ?? "").trim();

/** A customer's or vendor's postal address as printable lines: street, unit, "City, Emirate Postal", country. */
export function contactAddressLines(contact: ContactAddress | null | undefined, includeCountry = true) {
  if (!contact) return [];
  const city = text(contact.city);
  const region = text(contact.region);
  const locality = [city, region.toLowerCase() === city.toLowerCase() ? "" : region].filter(Boolean).join(", ");
  return [
    text(contact.addressLine1),
    text(contact.addressLine2),
    [locality, text(contact.postalCode)].filter(Boolean).join(" "),
    includeCountry ? text(contact.country) : "",
  ].filter(Boolean);
}
