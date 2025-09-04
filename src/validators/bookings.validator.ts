import { body, param, query } from "express-validator";
import { AvailableBookingStatus } from "../models/bookings.model";

const getAllBookingsValidators = () => {
  return [
    query("status").optional().isIn(AvailableBookingStatus),
    query("bookingDate").optional().isISO8601().toDate(),
    query("customerId").optional().isMongoId(),
    query("motorcycleId").optional().isMongoId(),
  ];
};

const createBookingValidators = () => {
  return [
    body("motorcycleId").exists().isMongoId(),
    body("quantity").exists().isInt({ min: 1 }),
    body("startDate").exists().isISO8601().toDate(),
    body("endDate").exists().isISO8601().toDate(),
    body("promoCode").optional().isString().trim(),
  ];
};

const modifyBookingValidators = () => {
  return [
    param("bookingId").exists().isMongoId(),
    body("status")
      .exists()
      .toUpperCase()
      .isIn(AvailableBookingStatus)
      .withMessage(
        `Status must be one of: ${AvailableBookingStatus.join(", ")}`,
      ),
  ];
};

const verifyRazorpayPaymentValidator = () => {
  return [
    body("razorpay_order_id")
      .trim()
      .notEmpty()
      .withMessage("Razorpay order id is missing"),
    body("razorpay_payment_id")
      .trim()
      .notEmpty()
      .withMessage("Razorpay payment id is missing"),
    body("razorpay_signature")
      .trim()
      .notEmpty()
      .withMessage("Razorpay signature is missing"),
  ];
};

const verifyPaypalPaymentValidator = () => {
  return [
    body("orderId").trim().notEmpty().withMessage("Paypal order id is missing"),
  ];
};

const orderUpdateStatusValidator = () => {
  return [
    body("status")
      .trim()
      .notEmpty()
      .isIn(AvailableBookingStatus)
      .withMessage("Invalid Booking status"),
  ];
};

export {
  getAllBookingsValidators,
  createBookingValidators,
  modifyBookingValidators,
  verifyRazorpayPaymentValidator,
  verifyPaypalPaymentValidator,
  orderUpdateStatusValidator,
};
