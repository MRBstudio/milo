export const MAX_NAME_LENGTH = 80;
export const MAX_LINES = 10;
export const MAX_QTY_PER_ITEM = 10;
export const CODE_LENGTH = 16;

const PHONE_RE = /^09\d{9}$/;
const CODE_RE = /^MILO-[0-9A-Z]{2,32}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function validPhone(phone: unknown): phone is string {
  return typeof phone === "string" && PHONE_RE.test(phone);
}

/** Pickup codes are operator-supplied; keep them to the format we mint. */
export function validCode(code: unknown): code is string {
  return typeof code === "string" && CODE_RE.test(code);
}

/** cuid()s and other ids we hand out; rejects oversized/odd lookup keys. */
export function validId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

export function validName(name: unknown): name is string {
  return typeof name === "string" && name.trim().length > 0 && name.trim().length <= MAX_NAME_LENGTH;
}

export function validQty(qty: unknown): qty is number {
  return typeof qty === "number" && Number.isInteger(qty) && qty >= 1 && qty <= MAX_QTY_PER_ITEM;
}
