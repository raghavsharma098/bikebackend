import mongoose from "mongoose";
import { ICartItem } from "./carts.model";
import { AvailableInCities } from "./motorcycles.model";
import {
  AvailablePaymentProviders,
  AvailableUserRoles,
  PaymentProviderEnum,
  UserRolesEnum,
} from "../constants/constants";

export const BookingStatusEnum = {
  PENDING: "PENDING",
  RESERVED: "RESERVED",
  CONFIRMED: "CONFIRMED",
  CANCELLATION_REQUESTED: "CANCELLATION REQUESTED",
  STARTED: "STARTED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;

export const PaymentStatusEnum = {
  PARTIAL_PAID: "PARTIAL-PAID",
  FULLY_PAID: "FULLY-PAID",
  UNPAID: "UNPAID",
  REFUND_IN_PROGRESS: "REFUND-IN-PROGRESS",
  REFUND_INITIATED: "REFUND-INITIATED",
  FULLY_REFUNDED: "REFUNDED",
} as const;

export const AvailableBookingStatus = Object.values(BookingStatusEnum);
export const AvailablePaymentStatus = Object.values(PaymentStatusEnum);

export type BookingStatus = (typeof AvailableBookingStatus)[number];
export type PaymentStatus = (typeof AvailablePaymentStatus)[number];

export interface IPaymentTransaction {
  paymentId: string;
  amount: number;
  provider: AvailablePaymentProviders;
  status: string;
}

export interface IBooking extends mongoose.Document {
  customerId: mongoose.Types.ObjectId;
  status: BookingStatus;
  bookingDate: Date;
  rentTotal: number;
  securityDepositTotal: number;
  cartTotal: number;
  discountedTotal: number;
  totalTax: number;
  paidAmount: number;
  remainingAmount: number;
  customer: { fullname: string; email: string; phone: string };
  cancellationReason?: string;
  cancellationCharge?: number;
  refundAmount: number;
  couponId: mongoose.Types.ObjectId | null;
  items: ICartItem[];
  paymentProvider: AvailablePaymentProviders;
  payments: IPaymentTransaction[];
  paymentStatus: PaymentStatus;
  cancelledBy: {
    role: AvailableUserRoles;
  };
  addons?: Array<{
    category: string;
    description: string;
    size: string;
    quantity: number;
  }>;
  homeDelivery?: boolean;
}

const paymentTransactionSchema = new mongoose.Schema<IPaymentTransaction>({
  paymentId: { type: String, required: true },
  amount: { type: Number, required: true },
  provider: { type: String, enum: AvailablePaymentProviders, required: true },
  status: { type: String, required: true, default: "unpaid" },
});

const bookingSchema = new mongoose.Schema<IBooking>(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: AvailableBookingStatus,
      default: BookingStatusEnum.PENDING,
    },
    bookingDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    rentTotal: {
      type: Number,
      required: true,
    },
    securityDepositTotal: {
      type: Number,
      required: true,
    },
    cartTotal: {
      type: Number,
      required: true,
    },
    discountedTotal: {
      type: Number,
      required: true,
    },
    totalTax: {
      type: Number,
      default: 0,
    },
    paidAmount: {
      type: Number,
      required: true,
    },
    remainingAmount: {
      type: Number,
      required: true,
    },
    cancellationReason: {
      type: String,
    },
    cancellationCharge: {
      type: Number,
    },
    cancelledBy: {
      role: {
        type: String,
        enum: AvailableUserRoles,
      },
    },
    refundAmount: {
      type: Number,
    },
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PromoCode",
      default: null,
    },
    items: {
      type: [
        {
          motorcycleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Motorcycle",
            required: true,
          },
          quantity: {
            type: Number,
            required: true,
          },
          pickupDate: {
            type: Date,
            required: true,
          },
          dropoffDate: {
            type: Date,
            required: true,
          },
          pickupTime: {
            type: String,
            required: true,
          },
          dropoffTime: {
            type: String,
            required: true,
          },
          pickupLocation: {
            type: String,
            enum: AvailableInCities,
            required: true,
          },
          dropoffLocation: {
            type: String,
            enum: AvailableInCities,
            required: true,
          },
          motorcycle: {
            make: String,
            vehicleModel: String,
            variant: String,
            color: String,
          },
          duration: {
            type: String,
            required: true,
          },
          rentAmount: {
            type: Number,
            required: true,
          },
          discountedRentAmount: {
            type: Number,
          },
          totalHours: {
            type: Number,
            required: true,
          },
          taxPercentage: {
            type: Number,
            required: true,
          },
          totalTax: {
            type: Number,
            required: true,
          },
        },
      ],
    },
    paymentProvider: {
      type: String,
      enum: AvailablePaymentProviders,
      default: PaymentProviderEnum.UNKNOWN,
      required: true,
    },
    payments: { type: [paymentTransactionSchema], default: [] },
    paymentStatus: {
      type: String,
      enum: AvailablePaymentStatus,
      default: PaymentStatusEnum.UNPAID,
    },
    customer: {
      fullname: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String },
    },
    addons: [
      {
        category: { type: String, required: true },
        description: { type: String },
        size: { type: String, required: true },
        quantity: { type: Number, required: true, default: 1 },
      },
    ],
    homeDelivery: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const Booking = mongoose.model<IBooking>("Booking", bookingSchema);
