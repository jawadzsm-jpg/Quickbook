/**
 * Delivery address (Ship To) text is effectively unlimited for users; this very large cap (about 60 printed pages)
 * only stops an accidental mass paste from making a request too big to save.
 */
export const DELIVERY_ADDRESS_MAX = 200_000;

export const cleanDeliveryAddress = (value: unknown) => String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, DELIVERY_ADDRESS_MAX);
