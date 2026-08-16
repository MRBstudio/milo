/** Iranian mobile number: 09xx xxx xxxx */
export const PHONE_PATTERN = /^09\d{9}$/;
export const PHONE_LENGTH = 11;
export const PHONE_PLACEHOLDER = "09xxxxxxxxx";
export const PHONE_ERROR_FA = "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود";

export function isValidPhone(phone: string): boolean {
  return PHONE_PATTERN.test(phone);
}
