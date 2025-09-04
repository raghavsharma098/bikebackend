export const UserRolesEnum = {
  ADMIN: "ADMIN",
  CUSTOMER: "CUSTOMER",
  SUPPORT: "SUPPORT",
} as const;

export const PaymentProviderEnum = {
  UNKNOWN: "UNKNOWN",
  RAZORPAY: "RAZORPAY",
  UPI: "UPI",
  CASH: "CASH",
  PAYPAL: "PAYPAL",
} as const;

export const PromoCodeTypeEnum = {
  FLAT: "FLAT",
  PERCENTAGE: "PERCENTAGE",
} as const;

export const UserAuthType = {
  GOOGLE: "GOOGLE",
  GITHUB: "GITHUB",
  CREDENTIALS: "CREDENTIALS",
} as const;

export const AvailableUserRoles = Object.values(UserRolesEnum);
export const AvailablePaymentProviders = Object.values(PaymentProviderEnum);
export const AvailablePromoCodeTypes = Object.values(PromoCodeTypeEnum);
export const AvailableAuthTypes = Object.values(UserAuthType);

export type AvailableUserRoles = (typeof AvailableUserRoles)[number];
export type AvailablePaymentProviders =
  (typeof AvailablePaymentProviders)[number];
export type AvailablePromoCodeTypes = (typeof AvailablePromoCodeTypes)[number];
export type AvailableAuthTypes = (typeof AvailableAuthTypes)[number];
