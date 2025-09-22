import asyncHandler from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";
import { ApiError } from "../utils/api-error";
import { CustomRequest, User } from "../models/users.model";
import { Request, Response } from "express";
import {
  AvailableBookingStatus,
  AvailablePaymentStatus,
  Booking,
  BookingStatus,
  BookingStatusEnum,
  PaymentStatusEnum,
} from "../models/bookings.model";
import { Motorcycle } from "../models/motorcycles.model";
import mongoose from "mongoose";
import { PaymentProviderEnum, UserRolesEnum } from "../constants/constants";
import { paypalAPI } from "../utils/paypal";
import { Cart, ICartItem } from "../models/carts.model";
import { getCart } from "./carts.controller";
import razorpayInstance from "../utils/razorpay";
import { nanoid } from "nanoid";
import crypto from "crypto";
import {
  CANCELLATION_CHARGE,
  COMPANY_NAME,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
} from "../utils/env";
import {
  bookingCancellationTemplate,
  bookingConfirmationTemplate,
  sendEmail,
} from "../utils/mail";
import logger from "../loggers/winston.logger";
import { differenceInDays } from "date-fns";

const handleBooking = async (
  bookingPaymentId: string, // razorpay_order_id
  req: CustomRequest,
  amount: number,
) => {
  const order = await Booking.findOne({
    "payments.paymentId": bookingPaymentId,
  });

  if (!order) {
    throw new ApiError(404, "Booking record not found for this payment ID");
  }

  if (
    order.status === BookingStatusEnum.CONFIRMED ||
    order.status === BookingStatusEnum.COMPLETED
  ) {
    throw new ApiError(
      400,
      `Booking ${order._id} is already confirmed. Ignoring duplicate verification.`,
    );
  }

  const wasNewBooking = order.status === BookingStatusEnum.PENDING;

  order.paidAmount += amount;
  order.remainingAmount = order.discountedTotal - order.paidAmount;
  order.payments = order.payments.map((p) =>
    p.paymentId === bookingPaymentId
      ? {
          ...p,
          amount,
          provider: PaymentProviderEnum.RAZORPAY,
          status: "paid",
        }
      : p,
  );

  if (order.remainingAmount <= 0.01) {
    order.status = BookingStatusEnum.CONFIRMED;
    order.paymentStatus = PaymentStatusEnum.FULLY_PAID;
    order.remainingAmount = 0;
  } else {
    order.status = BookingStatusEnum.RESERVED;
    order.paymentStatus = PaymentStatusEnum.PARTIAL_PAID;
  }

  await order.save({ validateBeforeSave: false });

  if (wasNewBooking) {
    const bulkStockUpdates = order.items.map((item: ICartItem) => ({
      updateOne: {
        filter: {
          _id: item.motorcycleId,
          "availableInCities.branch": item.pickupLocation,
        },
        update: {
          $inc: { "availableInCities.$.quantity": -item.quantity },
        },
      },
    }));

    /* 
      (bulkWrite()) is faster than sending multiple independent operations (e.g. if you use create()) 
      because with bulkWrite() there is only one network round trip to the MongoDB server.
    */

    if (bulkStockUpdates.length > 0) {
      await Motorcycle.bulkWrite(bulkStockUpdates, { skipValidation: true });
    }

    await Cart.findOneAndUpdate(
      { customerId: req.user._id },
      { $set: { items: [], couponId: null } },
    );
  }

  const populatedOrderArr = await Booking.aggregate([
    { $match: { _id: order._id } },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "motorcycles",
        localField: "items.motorcycleId",
        foreignField: "_id",
        as: "items.motorcycle",
      },
    },
    {
      $addFields: {
        "items.motorcycle": { $arrayElemAt: ["$items.motorcycle", 0] },
      },
    },
    {
      $group: {
        _id: "$_id",
        customerId: { $first: "$customerId" },
        status: { $first: "$status" },
        bookingDate: { $first: "$bookingDate" },
        rentTotal: { $first: "$rentTotal" },
        securityDepositTotal: { $first: "$securityDepositTotal" },
        totalTax: { $first: "$totalTax" },
        cartTotal: { $first: "$cartTotal" },
        discountedTotal: { $first: "$discountedTotal" },
        paidAmount: { $first: "$paidAmount" },
        remainingAmount: { $first: "$remainingAmount" },
        couponId: { $first: "$couponId" },
        items: { $push: "$items" },
        paymentProvider: { $first: "$paymentProvider" },
        payments: { $first: "$payments" },
        paymentStatus: { $first: "$paymentStatus" },
        customer: { $first: "$customer" },
        createdAt: { $first: "$createdAt" },
        updatedAt: { $first: "$updatedAt" },
      },
    },
  ]);

  if (!populatedOrderArr || populatedOrderArr.length === 0) {
    logger.error(
      `Could not find booking ${order._id} for email confirmation after update.`,
    );
    console.error(
      `Could not find booking ${order._id} for email confirmation after update.`,
    );
    return order;
  }

  const populatedOrder = populatedOrderArr[0];
  
  console.log("[BOOKING EMAIL DEBUG] About to send booking confirmation emails");
  console.log("[BOOKING EMAIL DEBUG] Customer email:", req.user?.email);
  console.log("[BOOKING EMAIL DEBUG] Customer username:", req.user?.username);
  console.log("[BOOKING EMAIL DEBUG] Booking ID:", populatedOrder._id.toString());
  
  try {
    // Send booking confirmation email only to admin (not to customer)
    console.log("[BOOKING EMAIL DEBUG] Sending booking notification to admin only...");
    await sendEmail({
      email: "hello@torqrides.com",
      subject: `${COMPANY_NAME} - New Booking Alert #${populatedOrder._id.toString().slice(-6).toUpperCase()}`,
      template: bookingConfirmationTemplate({
        username: req.user?.username,
        booking: populatedOrder,
      }),
    });
    console.log("[BOOKING EMAIL DEBUG] Admin email sent successfully");
  } catch (error) {
    console.error("[BOOKING EMAIL DEBUG] Error sending admin email:", error);
  }

  return populatedOrder;
};

const getBooking = async (bookingId: string) => {
  const bookingAggregation = await Booking.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(bookingId) } },
    {
      $lookup: {
        from: "users",
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $addFields: { customer: { $arrayElemAt: ["$customer", 0] } } },
    { $unwind: "$items" },
    {
      $lookup: {
        from: "motorcycles",
        localField: "items.motorcycleId",
        foreignField: "_id",
        as: "items.motorcycle",
      },
    },
    {
      $addFields: {
        "items.motorcycle": { $arrayElemAt: ["$items.motorcycle", 0] },
      },
    },
    {
      $group: {
        _id: "$_id",
        customerId: { $first: "$customerId" },
        status: { $first: "$status" },
        paymentProvider: { $first: "$paymentProvider" },
        payments: { $first: "$payments" },
        bookingDate: { $first: "$bookingDate" },
        paymentStatus: { $first: "$paymentStatus" },
        rentTotal: { $first: "$rentTotal" },
        securityDepositTotal: { $first: "$securityDepositTotal" },
        totalTax: { $first: "$totalTax" },
        cartTotal: { $first: "$cartTotal" },
        discountedTotal: { $first: "$discountedTotal" },
        paidAmount: { $first: "$paidAmount" },
        remainingAmount: { $first: "$remainingAmount" },
        cancellationCharge: { $first: "$cancellationCharge" },
        cancellationReason: { $first: "$cancellationReason" },
        cancelledBy: { $first: "$cancelledBy" },
        refundAmount: { $first: "$refundAmount" },
        createdAt: { $first: "$createdAt" },
        updatedAt: { $first: "$updatedAt" },
        customer: { $first: "$customer" },
        items: { $push: "$items" },
        couponId: { $first: "$couponId" },
      },
    },
    { $project: { "customer.password": 0, "customer.refreshToken": 0 } },
  ]);

  if (!bookingAggregation.length) {
    throw new ApiError(404, "Booking not found");
  }

  return bookingAggregation[0];
};

const getAllBookings = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      page = 1,
      offset = 10,
      status,
      customerId,
      bookingDate,
    } = req.query;
    const pageNum = Math.max(Number(page), 1);
    const limit = Math.max(Number(offset), 1);
    const skip = (pageNum - 1) * limit;

    const matchStage: Record<string, any> = {};

    if (AvailableBookingStatus.includes(status as BookingStatus))
      matchStage.status = status;
    if (bookingDate) matchStage.bookingDate = bookingDate;
    if (req.user.role === UserRolesEnum.CUSTOMER) {
      matchStage.customerId = new mongoose.Types.ObjectId(
        req.user._id as string,
      );
    } else if (customerId) {
      matchStage.customerId = new mongoose.Types.ObjectId(customerId as string);
    }

    let pipeline = [];

    if (Object.keys(matchStage).length) pipeline.push({ $match: matchStage });

    if (req.user.role === UserRolesEnum.ADMIN) {
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "customerId",
          foreignField: "_id",
          pipeline: [
            { $project: { username: 1, fullname: 1, email: 1, phone: 1 } },
          ],
          as: "customer",
        },
      });
      pipeline.push({
        $addFields: { customer: { $arrayElemAt: ["$customer", 0] } },
      });
    }

    const bookings = await Booking.aggregate([
      ...pipeline,
      { $unwind: "$items" },
      {
        $lookup: {
          from: "motorcycles",
          let: { mid: "$items.motorcycleId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$mid"] } } },
            { $project: { maintenanceLogs: 0 } },
          ],
          as: "items.motorcycle",
        },
      },
      // flatten the lookup array
      {
        $addFields: {
          "items.motorcycle": { $arrayElemAt: ["$items.motorcycle", 0] },
        },
      },
      // 4) RE‑GROUP back to one document per booking
      {
        $group: {
          _id: "$_id",
          customerId: { $first: "$customerId" },
          status: { $first: "$status" },
          paymentProvider: { $first: "$paymentProvider" },
          payments: { $first: "$payments" },
          bookingDate: { $first: "$bookingDate" },
          paymentStatus: { $first: "$paymentStatus" },
          rentTotal: { $first: "$rentTotal" },
          securityDepositTotal: { $first: "$securityDepositTotal" },
          totalTax: { $first: "$totalTax" },
          cartTotal: { $first: "$cartTotal" },
          discountedTotal: { $first: "$discountedTotal" },
          paidAmount: { $first: "$paidAmount" },
          remainingAmount: { $first: "$remainingAmount" },
          cancellationCharge: { $first: "$cancellationCharge" },
          cancellationReason: { $first: "$cancellationReason" },
          cancelledBy: { $first: "$cancelledBy" },
          refundAmount: { $first: "$refundAmount" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          customer: { $first: "$customer" },
          items: { $push: "$items" },
          couponId: { $first: "$couponId" },
        },
      },
      {
        $lookup: {
          from: "promocodes",
          localField: "couponId",
          foreignField: "_id",
          as: "coupon",
        },
      },
      { $addFields: { coupon: { $arrayElemAt: ["$coupon", 0] } } },
      { $project: { "customer.password": 0, "customer.refreshToken": 0 } }, // Exclude sensitive fields
      { $sort: { bookingDate: -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }, { $addFields: { page: pageNum } }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]);

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Bookings fetched successfully",
          bookings[0],
        ),
      );
  },
);

const modifyBooking = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    const { status, paymentStatus, cancellationReason } = req.body;

    if (
      !AvailableBookingStatus.includes(status) ||
      !AvailablePaymentStatus.includes(paymentStatus)
    ) {
      throw new ApiError(400, "Invalid Booking or Payment status");
    }

    booking.status = status;
    booking.paymentStatus = paymentStatus;
    booking.cancellationReason = cancellationReason || "";

    if (paymentStatus === PaymentStatusEnum.FULLY_PAID) {
      booking.paymentStatus = paymentStatus;
      if (
        status === BookingStatusEnum.CONFIRMED ||
        status === BookingStatusEnum.COMPLETED
      )
        booking.status = status;
      booking.paidAmount = booking.discountedTotal;
      booking.remainingAmount = 0;
    } else if (paymentStatus === PaymentStatusEnum.PARTIAL_PAID) {
      booking.status = BookingStatusEnum.RESERVED;
    }

    await booking.save({ validateBeforeSave: false });

    const customer = await User.findById(booking.customerId).select(
      "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
    );

    const modifiedBooking = await Booking.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(bookingId),
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "motorcycles",
          let: { mid: "$items.motorcycleId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$mid"] } } },
            { $project: { maintenanceLogs: 0 } },
          ],
          as: "items.motorcycle",
        },
      },
      // flatten the lookup array
      {
        $addFields: {
          "items.motorcycle": { $arrayElemAt: ["$items.motorcycle", 0] },
        },
      },
      {
        $group: {
          _id: "$_id",
          customerId: { $first: "$customerId" },
          status: { $first: "$status" },
          paymentProvider: { $first: "$paymentProvider" },
          payments: { $first: "$payments" },
          bookingDate: { $first: "$bookingDate" },
          paymentStatus: { $first: "$paymentStatus" },
          rentTotal: { $first: "$rentTotal" },
          securityDepositTotal: { $first: "$securityDepositTotal" },
          cartTotal: { $first: "$cartTotal" },
          discountedTotal: { $first: "$discountedTotal" },
          paidAmount: { $first: "$paidAmount" },
          remainingAmount: { $first: "$remainingAmount" },
          cancellationCharge: { $first: "$cancellationCharge" },
          cancellationReason: { $first: "$cancellationReason" },
          cancelledBy: { $first: "$cancelledBy" },
          refundAmount: { $first: "$refundAmount" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          customer: { $first: "$customer" },
          items: { $push: "$items" },
          couponId: { $first: "$couponId" },
        },
      },
      {
        $lookup: {
          from: "promocodes",
          localField: "couponId",
          foreignField: "_id",
          as: "coupon",
        },
      },
      { $addFields: { coupon: { $arrayElemAt: ["$coupon", 0] } } },
    ]);

    return res.status(200).json(
      new ApiResponse(200, true, "Booking modified successfully", {
        modifiedBooking: modifiedBooking[0],
        customer: {
          username: customer?.username,
          fullname: customer?.fullname,
        },
      }),
    );
  },
);

const cancelBooking = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { bookingId } = req.params;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    if (
      req.user.role === UserRolesEnum.CUSTOMER &&
      req.user._id?.toString() !== booking.customerId.toString()
    ) {
      throw new ApiError(403, "Unauthorized action");
    }

    if (booking.status === BookingStatusEnum.CANCELLATION_REQUESTED) {
      throw new ApiError(400, "Cancellation request already sent.");
    }

    if (booking.status === BookingStatusEnum.CANCELLED) {
      throw new ApiError(400, "Booking is already cancelled.");
    }

    const minimumBookingDate: Date = booking.items.reduce<Date>(
      (minDate, item) => {
        const pd =
          item.pickupDate instanceof Date
            ? item.pickupDate
            : new Date(item.pickupDate);

        return pd < minDate ? pd : minDate;
      },

      booking.items[0].pickupDate instanceof Date
        ? booking.items[0].pickupDate
        : new Date(booking.items[0].pickupDate),
    );

    const daysUntilPickup = differenceInDays(minimumBookingDate, new Date());

    let cancellationChargePercentage = 0;

    if (daysUntilPickup < 3) {
      cancellationChargePercentage = 1;
    } else if (daysUntilPickup >= 3 && daysUntilPickup < 7) {
      cancellationChargePercentage = 0.5;
    } else {
      cancellationChargePercentage = 0;
    }

    let cancellationCharge = 0;

    if (booking.paymentStatus === PaymentStatusEnum.PARTIAL_PAID) {
      cancellationCharge = Math.max(
        booking.paidAmount * cancellationChargePercentage,
        Number(CANCELLATION_CHARGE),
      );
    } else if (booking.paymentStatus === PaymentStatusEnum.FULLY_PAID) {
      cancellationCharge = Math.max(
        (booking.rentTotal + booking.totalTax) * cancellationChargePercentage,
        Number(CANCELLATION_CHARGE),
      );
    }

    let refundableAmount = booking.paidAmount - cancellationCharge;

    if (refundableAmount < 0) {
      refundableAmount = 0;
    }

    const { cancellationReason } = req.body;

    booking.status = BookingStatusEnum.CANCELLATION_REQUESTED;
    booking.paymentStatus = PaymentStatusEnum.REFUND_IN_PROGRESS;
    booking.cancellationCharge = cancellationCharge;
    booking.refundAmount = refundableAmount;
    booking.cancellationReason = cancellationReason;
    booking.cancelledBy = { role: req.user.role };
    await booking.save({ validateBeforeSave: false });

    const bulkStockUpdates = booking.items.map((item: ICartItem) => ({
      updateOne: {
        filter: {
          _id: item.motorcycleId,
          "availableInCities.branch": item.pickupLocation,
        },
        update: {
          $inc: { "availableInCities.$.quantity": item.quantity },
        },
      },
    }));

    if (bulkStockUpdates.length > 0) {
      await Motorcycle.bulkWrite(bulkStockUpdates);
    }

    // TODO : Mechanism to Refund through Payment Provider

    const updatedBooking = await Booking.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(bookingId),
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "motorcycles",
          let: { mid: "$items.motorcycleId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$mid"] } } },
            { $project: { maintenanceLogs: 0 } },
          ],
          as: "items.motorcycle",
        },
      },
      // flatten the lookup array
      {
        $addFields: {
          "items.motorcycle": { $arrayElemAt: ["$items.motorcycle", 0] },
        },
      },
      {
        $group: {
          _id: "$_id",
          customerId: { $first: "$customerId" },
          status: { $first: "$status" },
          paymentProvider: { $first: "$paymentProvider" },
          payments: { $first: "$payments" },
          bookingDate: { $first: "$bookingDate" },
          paymentStatus: { $first: "$paymentStatus" },
          rentTotal: { $first: "$rentTotal" },
          securityDepositTotal: { $first: "$securityDepositTotal" },
          cartTotal: { $first: "$cartTotal" },
          discountedTotal: { $first: "$discountedTotal" },
          paidAmount: { $first: "$paidAmount" },
          remainingAmount: { $first: "$remainingAmount" },
          cancellationCharge: { $first: "$cancellationCharge" },
          cancellationReason: { $first: "$cancellationReason" },
          cancelledBy: { $first: "$cancelledBy" },
          refundAmount: { $first: "$refundAmount" },
          createdAt: { $first: "$createdAt" },
          updatedAt: { $first: "$updatedAt" },
          customer: { $first: "$customer" },
          items: { $push: "$items" },
          couponId: { $first: "$couponId" },
        },
      },
      {
        $lookup: {
          from: "promocodes",
          localField: "couponId",
          foreignField: "_id",
          as: "coupon",
        },
      },
      { $addFields: { coupon: { $arrayElemAt: ["$coupon", 0] } } },
    ]);

    const populatedOrder = updatedBooking[0];

    // Send booking cancellation notification only to admin (not to customer)
    sendEmail({
      email: "hello@torqrides.com",
      subject: `${COMPANY_NAME} - Booking Cancelled Alert #${populatedOrder._id.toString().slice(-6).toUpperCase()}`,
      template: bookingCancellationTemplate({
        username: req.user?.username,
        booking: populatedOrder,
      }),
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Booking cancelled successfully",
          updatedBooking[0],
        ),
      );
  },
);

const generateRazorpayOrder = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    console.log("RAZORPAY ORDER DEBUG: Starting order generation");
    console.log("Request body:", req.body);
    console.log("User authenticated:", !!req.user);
    console.log("User ID:", req.user?._id);
    console.log("User email:", req.user?.email);
    
    if (!razorpayInstance) {
      console.error("RAZORPAY ERROR: razorpayInstance is not initialized");
      console.error("RAZORPAY ERROR: `key_id` is mandatory");
      throw new ApiError(
        500,
        "Internal server error : RAZORPAY ERROR: `key_id` is mandatory",
      );
    }

    console.log("RAZORPAY ORDER DEBUG: Instance exists, proceeding...");

    const { mode, bookingId } = req.body;

    let amount: number;
    let receiptId: string | undefined;
    let bookingPayload: any;

    if (bookingId) {
      const existingBooking = await Booking.findById(bookingId);

      if (!existingBooking) {
        throw new ApiError(404, "Booking not found.");
      }
      if (existingBooking.customerId.toString() !== req.user._id?.toString()) {
        throw new ApiError(
          403,
          "You are not authorized to pay for this booking.",
        );
      }
      if (existingBooking.remainingAmount <= 0) {
        throw new ApiError(400, "This booking has no remaining balance.");
      }

      amount = existingBooking.remainingAmount;
      receiptId = existingBooking._id?.toString();
      bookingPayload = existingBooking;
    } else {
      if (!mode) {
        throw new ApiError(
          400,
          "Payment mode ('p' or 'f') is required for new bookings.",
        );
      }

      const userCart = await getCart(req.user._id as string);
      if (!userCart || !userCart.items?.length) {
        throw new ApiError(400, "Your cart is empty.");
      }

      amount =
        mode === "p"
          ? 0.2 * userCart.discountedRentTotal
          : userCart.discountedTotal;
      receiptId = nanoid(10);

      /* 
        Create an order while we generate razorpay session 
        In case payment is done and there is some network issue in the payment verification API
        We will at least have a record of the order
      */
      bookingPayload = {
        customerId: req.user._id as mongoose.Types.ObjectId,
        status: BookingStatusEnum.PENDING,
        items: userCart.items,
        rentTotal: userCart.rentTotal,
        securityDepositTotal: userCart.securityDepositTotal,
        totalTax: userCart.totalTax,
        cartTotal: userCart.cartTotal,
        discountedTotal: userCart.discountedTotal,
        paidAmount: 0,
        remainingAmount: userCart.discountedTotal,
        paymentProvider: PaymentProviderEnum.RAZORPAY,
        couponId: userCart.coupon?._id,
        customer: {
          fullname: req.user.fullname,
          email: req.user.email,
        },
      };
    }

    const orderOptions = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: receiptId,
      payment_capture: 1,
    };

    try {
      console.log("RAZORPAY ORDER DEBUG: Creating order with options:", orderOptions);
      console.log("RAZORPAY DEBUG: Using key_id:", RAZORPAY_KEY_ID);
      console.log("RAZORPAY DEBUG: Using key_secret:", RAZORPAY_KEY_SECRET ? `${RAZORPAY_KEY_SECRET.substring(0, 10)}...` : 'NOT SET');
      
      const razorpayOrder = await razorpayInstance.orders.create(orderOptions);
      console.log("RAZORPAY ORDER DEBUG: Order created successfully:", razorpayOrder);

      if (!razorpayOrder) {
        console.error("RAZORPAY ORDER ERROR: Order creation returned null/undefined");
        return res
          .status(500)
          .json(
            new ApiResponse(
              500,
              false,
              "Something went wrong while initialising the razorpay order.",
            ),
          );
      }

      console.log("RAZORPAY ORDER DEBUG: Adding payment to booking payload...");
      if (bookingPayload.payments) {
        bookingPayload.payments.push({
          paymentId: razorpayOrder.id,
          amount,
          provider: PaymentProviderEnum.RAZORPAY,
          status: "unpaid",
        });
      } else {
        bookingPayload.payments = [
          {
            paymentId: razorpayOrder.id,
            amount,
            provider: PaymentProviderEnum.RAZORPAY,
            status: "unpaid",
          },
        ];
      }

      let booking: any;

      if (bookingId) {
        await bookingPayload.save({ validateBeforeSave: false });
        const updatedBooking = await Booking.aggregate([
          {
            $match: {
              _id: new mongoose.Types.ObjectId(bookingId),
            },
          },
          { $unwind: "$items" },
          {
            $lookup: {
              from: "motorcycles",
              let: { mid: "$items.motorcycleId" },
              pipeline: [
                { $match: { $expr: { $eq: ["$_id", "$$mid"] } } },
                { $project: { maintenanceLogs: 0 } },
              ],
              as: "items.motorcycle",
            },
          },
          // flatten the lookup array
          {
            $addFields: {
              "items.motorcycle": { $arrayElemAt: ["$items.motorcycle", 0] },
            },
          },
          {
            $group: {
              _id: "$_id",
              customerId: { $first: "$customerId" },
              status: { $first: "$status" },
              paymentProvider: { $first: "$paymentProvider" },
              payments: { $first: "$payments" },
              bookingDate: { $first: "$bookingDate" },
              paymentStatus: { $first: "$paymentStatus" },
              rentTotal: { $first: "$rentTotal" },
              securityDepositTotal: { $first: "$securityDepositTotal" },
              cartTotal: { $first: "$cartTotal" },
              discountedTotal: { $first: "$discountedTotal" },
              paidAmount: { $first: "$paidAmount" },
              remainingAmount: { $first: "$remainingAmount" },
              cancellationCharge: { $first: "$cancellationCharge" },
              cancellationReason: { $first: "$cancellationReason" },
              cancelledBy: { $first: "$cancelledBy" },
              refundAmount: { $first: "$refundAmount" },
              createdAt: { $first: "$createdAt" },
              updatedAt: { $first: "$updatedAt" },
              customer: { $first: "$customer" },
              items: { $push: "$items" },
              couponId: { $first: "$couponId" },
            },
          },
          {
            $lookup: {
              from: "promocodes",
              localField: "couponId",
              foreignField: "_id",
              as: "coupon",
            },
          },
          { $addFields: { coupon: { $arrayElemAt: ["$coupon", 0] } } },
        ]);
        booking = updatedBooking[0];
      } else {
        const newBooking = await Booking.create(bookingPayload);
        if (!newBooking) {
          // This is a critical failure: a charge was created but not saved in our DB.
          // This needs logging for manual intervention.
          console.error(
            `CRITICAL: Razorpay order ${razorpayOrder.id} was created but the booking failed to save to the DB.`,
          );
          throw new ApiError(
            500,
            "Server error: Could not record the booking after payment initialization.",
          );
        }

        const updatedBooking = await Booking.aggregate([
          {
            $match: {
              _id: new mongoose.Types.ObjectId(newBooking._id?.toString()),
            },
          },
          { $unwind: "$items" },
          {
            $lookup: {
              from: "motorcycles",
              let: { mid: "$items.motorcycleId" },
              pipeline: [
                { $match: { $expr: { $eq: ["$_id", "$$mid"] } } },
                { $project: { maintenanceLogs: 0 } },
              ],
              as: "items.motorcycle",
            },
          },
          // flatten the lookup array
          {
            $addFields: {
              "items.motorcycle": { $arrayElemAt: ["$items.motorcycle", 0] },
            },
          },
          {
            $group: {
              _id: "$_id",
              customerId: { $first: "$customerId" },
              status: { $first: "$status" },
              paymentProvider: { $first: "$paymentProvider" },
              payments: { $first: "$payments" },
              bookingDate: { $first: "$bookingDate" },
              paymentStatus: { $first: "$paymentStatus" },
              rentTotal: { $first: "$rentTotal" },
              securityDepositTotal: { $first: "$securityDepositTotal" },
              cartTotal: { $first: "$cartTotal" },
              discountedTotal: { $first: "$discountedTotal" },
              paidAmount: { $first: "$paidAmount" },
              remainingAmount: { $first: "$remainingAmount" },
              cancellationCharge: { $first: "$cancellationCharge" },
              cancellationReason: { $first: "$cancellationReason" },
              cancelledBy: { $first: "$cancelledBy" },
              refundAmount: { $first: "$refundAmount" },
              createdAt: { $first: "$createdAt" },
              updatedAt: { $first: "$updatedAt" },
              customer: { $first: "$customer" },
              items: { $push: "$items" },
              couponId: { $first: "$couponId" },
            },
          },
          {
            $lookup: {
              from: "promocodes",
              localField: "couponId",
              foreignField: "_id",
              as: "coupon",
            },
          },
          { $addFields: { coupon: { $arrayElemAt: ["$coupon", 0] } } },
        ]);
        booking = updatedBooking[0];
      }

      // order successful

      return res.status(201).json(
        new ApiResponse(201, true, "Razorpay order generated", {
          order: razorpayOrder,
          booking,
          razorpayKeyId: RAZORPAY_KEY_ID, // Add the public key for frontend initialization
        }),
      );
    } catch (err: any) {
      console.error("RAZORPAY ORDER ERROR: Exception caught:", err);
      console.error("Error type:", typeof err);
      console.error("Error message:", err.message);
      console.error("Error statusCode:", err.statusCode);
      console.error("Error stack:", err.stack);
      
      const status = err.statusCode ?? 500;
      const message = err.error?.reason ?? err.message ?? "Unknown error";
      console.log("RAZORPAY ORDER ERROR: Returning status:", status, "message:", message);
      
      return res
        .status(status)
        .json(new ApiResponse(status, false, message, null));
    }
  },
);

const verifyRazorpayPayment = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount,
    } = req.body;

    let body = razorpay_order_id + "|" + razorpay_payment_id;

    let expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      const order = await handleBooking(razorpay_order_id, req, amount);
      return res
        .status(201)
        .json(new ApiResponse(201, true, "Order placed successfully", order));
    } else {
      throw new ApiError(400, "Invalid razorpay signature");
    }
  },
);

const generatePaypalOrder = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const cart = await Cart.findOne({ customerId: req.user._id });

    if (!cart || !cart.items?.length) {
      throw new ApiError(400, "Your cart is empty");
    }

    const orderItems = cart.items;
    const userCart = await getCart(req.user._id as string);

    const totalPrice = userCart.cartTotal;
    const totalDiscountedPrice = userCart.discountedTotal;

    const response = await paypalAPI("/", {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: (totalDiscountedPrice * 0.011692).toFixed(0),
          },
        },
      ],
    });

    const paypalOrder = await response.json();

    if (paypalOrder?.id) {
      /* 
        Create an order while we generate paypal session 
        In case payment is done and there is some network issue in the payment verification API
        We will at least have a record of the order
      */

      const unpaidOrder = await Booking.create({
        cartId: cart._id,
        customerId: req.user._id,
        totalCost: totalPrice ?? 0,
        discountedTotal: totalDiscountedPrice ?? 0,
        couponId: userCart.coupon?._id,
        items: orderItems,
        paymentProvider: PaymentProviderEnum.PAYPAL,
        paymentId: paypalOrder.id,
      });

      if (unpaidOrder) {
        return res
          .status(201)
          .json(
            new ApiResponse(
              201,
              paypalOrder,
              "Paypal order generated successfully",
            ),
          );
      }
    }
    //  No paypal-order or No unpaidOrder created throw an error
    console.error(
      "Make sure you have provided your PAYPAL credentials in the .env file",
    );
    throw new ApiError(
      500,
      "Something went wrong while initialising the paypal order.",
    );
  },
);

const verifyPaypalPayment = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { orderId, amount } = req.body;

    const response = await paypalAPI(`/${orderId}/capture`, {});
    const capturedData = await response.json();

    if (capturedData?.status === "COMPLETED") {
      const order = await handleBooking(capturedData.id, req, amount);

      return res
        .status(200)
        .json(new ApiResponse(200, true, "Order placed successfully", order));
    } else {
      throw new ApiError(500, "Something went wrong with the paypal payment");
    }
  },
);

const updateBookingStatus = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { bookingId } = req.params;
    const { status } = req.body;

    let booking = await Booking.findById(bookingId);

    if (!booking) {
      throw new ApiError(404, "Order does not exist");
    }

    if (booking.status === BookingStatusEnum.COMPLETED) {
      throw new ApiError(400, "Order is already delivered");
    }

    booking.status = status;
    await booking.save({ validateBeforeSave: false });
    return res.status(200).json(
      new ApiResponse(200, true, "Order status changed successfully", {
        status,
      }),
    );
  },
);

const getAnalytics = asyncHandler(async (req: CustomRequest, res: Response) => {
  // Assume salesFromDate and salesUptoDate are JS Date objects, and
  // (optionally) reportMonth is an integer 1–12 of the month you want to drill into.
  // If you omit reportMonth, we’ll default to the month of salesFromDate.

  const salesFromDate = new Date(); /* your from date */
  const salesUptoDate = new Date(); /* your upto date */
  const reportMonth = 4; /* optional: a month number 1–12 */

  // Precompute for “current month” logic:
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth() + 1;
  const endOfMonth =
    reportMonth === thisMonth && now >= salesFromDate
      ? now
      : new Date(thisYear, reportMonth || now.getMonth() + 1, 0, 23, 59, 59);

  const matchStage = {
    $match: {
      bookingDate: {
        $gte: salesFromDate,
        $lte: salesUptoDate,
      },
      status: "COMPLETED", // only count completed bookings
      paymentStatus: "FULLY-PAID", // only fully paid ones
    },
  };

  const lookupMotor = {
    $lookup: {
      from: "motorcycles",
      localField: "items.motorcycleId",
      foreignField: "_id",
      as: "motorcycles",
    },
  };

  const unwindItems = { $unwind: "$items" };
  const addDateFields = {
    $addFields: {
      year: { $year: "$bookingDate" },
      month: { $month: "$bookingDate" },
      day: { $dayOfMonth: "$bookingDate" },
      // week of month (1–5):
      weekOfMonth: {
        $ceil: { $divide: [{ $dayOfMonth: "$bookingDate" }, 7] },
      },
    },
  };

  const facetStage = {
    $facet: {
      // 1) Weekly totals for the “reportMonth”
      weekly: [
        {
          $match: {
            year: thisYear,
            month: reportMonth || thisMonth,
          },
        },
        {
          $group: {
            _id: "$weekOfMonth",
            totalSales: { $sum: "$rentTotal" },
          },
        },
        { $sort: { _id: 1 as const } },
        {
          $project: {
            name: { $concat: ["Week ", { $toString: "$_id" }] },
            weekly: "$totalSales",
            _id: 0,
          },
        },
      ],

      // 2) Monthly totals for the full range
      monthly: [
        {
          $group: {
            _id: { year: "$year", month: "$month" },
            totalSales: { $sum: "$rentTotal" },
          },
        },
        { $sort: { "_id.year": 1 as const, "_id.month": 1 as const } },
        {
          $project: {
            name: {
              $arrayElemAt: [
                [
                  "",
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ],
                "$_id.month",
              ],
            },
            monthly: "$totalSales",
            _id: 0,
          },
        },
      ],

      // 3) Year‑to‑date monthly breakdown for the year of salesFromDate
      yearly: [
        { $match: { year: thisYear } },
        {
          $group: {
            _id: "$month",
            totalSales: { $sum: "$rentTotal" },
          },
        },
        { $sort: { _id: 1 as const } },
        {
          $project: {
            name: {
              $arrayElemAt: [
                [
                  "",
                  "Jan",
                  "Feb",
                  "Mar",
                  "Apr",
                  "May",
                  "Jun",
                  "Jul",
                  "Aug",
                  "Sep",
                  "Oct",
                  "Nov",
                  "Dec",
                ],
                "$_id",
              ],
            },
            yearly: "$totalSales",
            _id: 0,
          },
        },
      ],

      // 4) Distribution of bookings by motorcycle category
      bikes: [
        unwindItems,
        lookupMotor,
        { $unwind: "$motorcycles" },
        {
          $group: {
            _id: "$motorcycles.category",
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            name: "$_id",
            value: "$count",
            _id: 0,
          },
        },
      ],
    },
  };

  const analytics = await Booking.aggregate([
    matchStage,
    addDateFields,
    facetStage,
  ]);

  // Then, in your application code, you can merge the three time series
  // (weekly, monthly, yearly) into one `salesData` array by month name,
  // e.g.:
  //   salesData = monthly.map(m => ({
  //     name: m.name,
  //     weekly: (weekly.find(w=>w.name.endsWith(m.name)) || {}).weekly || 0,
  //     monthly: m.monthly,
  //     yearly:  (yearly.find(y=>y.name===m.name)    || {}).yearly  || 0
  //   }));
  //
  // And `bikesSalesData = result[0].bikes`.

  return res
    .status(200)
    .json(new ApiResponse(200, true, "Advanced analytics data fetched successfully", analytics[0]));
});

async function getYearlySalesOverview(year: number) {
  const pipeline: mongoose.PipelineStage[] = [
    // 1. Filter bookings for the specified year and valid statuses
    {
      $match: {
        createdAt: {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lte: new Date(`${year}-12-31T23:59:59.999Z`),
        },
        // We consider all non-cancelled bookings as valid sales
        status: { $ne: "CANCELLED" },
      },
    },
    // 2. Group by month to get monthly totals and weekly data points
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
        },
        monthlyTotal: { $sum: "$paidAmount" },
        // Push each booking's sale amount to calculate weekly average later
        sales: { $push: { amount: "$paidAmount", createdAt: "$createdAt" } },
      },
    },
    // 3. Sort by month
    { $sort: { "_id.month": 1 } },
  ];

  const monthlySalesData = await Booking.aggregate(pipeline);

  const getMonthName = (monthNumber: number) => {
    const names = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return names[monthNumber - 1];
  };

  // 4. Post-process in code to format the data exactly as requested
  let yearlyCumulative = 0;
  const allMonthsData = Array.from({ length: 12 }, (_, i) => {
    const monthNumber = i + 1;
    const monthData = monthlySalesData.find((d) => d._id.month === monthNumber);

    if (monthData) {
      yearlyCumulative += monthData.monthlyTotal;

      // Calculate average weekly sales for the month
      const weeksInMonth = new Set(
        monthData.sales.map((s: any) =>
          Math.ceil(new Date(s.createdAt).getDate() / 7),
        ),
      );
      const averageWeekly = monthData.monthlyTotal / (weeksInMonth.size || 1);

      return {
        name: getMonthName(monthNumber),
        weekly: Math.round(averageWeekly),
        monthly: Math.round(monthData.monthlyTotal),
        yearly: Math.round(yearlyCumulative),
      };
    } else {
      // If no sales for a month, return zero values but maintain the cumulative total
      return {
        name: getMonthName(monthNumber),
        weekly: 0,
        monthly: 0,
        yearly: Math.round(yearlyCumulative),
      };
    }
  });

  return allMonthsData;
}

async function getWeeklySalesForMonth(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $ne: "CANCELLED" },
      },
    },
    {
      $group: {
        _id: { week: { $isoWeek: "$createdAt" } },
        totalSales: { $sum: "$paidAmount" },
        totalBookings: { $sum: 1 },
      },
    },
    { $sort: { "_id.week": 1 } },
    {
      $project: {
        _id: 0,
        week: "$_id.week",
        sales: "$totalSales",
        bookings: "$totalBookings",
      },
    },
  ];

  return Booking.aggregate(pipeline);
}

async function getSalesForDateRange(fromDate: string, toDate: string) {
  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        createdAt: { $gte: new Date(fromDate), $lte: new Date(toDate) },
        status: { $ne: "CANCELLED" },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        },
        totalSales: { $sum: "$paidAmount" },
        totalBookings: { $sum: 1 },
      },
    },
    { $sort: { "_id.date": 1 } },
    {
      $project: {
        _id: 0,
        date: "$_id.date",
        sales: "$totalSales",
        bookings: "$totalBookings",
      },
    },
  ];
  return Booking.aggregate(pipeline);
}

export const getDashboardStats = asyncHandler(
  async (req: Request, res: Response) => {
    // Using Promise.all to fetch all stats concurrently for better performance
    const [
      revenueResult,
      totalBookings,
      totalCustomers,
      totalUsers,
      totalMotorcycles,
      motorcycleCategories,
    ] = await Promise.all([
      Booking.aggregate([
        { $match: { status: { $ne: "CANCELLED" } } },
        { $group: { _id: null, total: { $sum: "$paidAmount" } } },
      ]),
      Booking.countDocuments({ status: { $ne: "CANCELLED" } }),
      User.countDocuments({ role: "CUSTOMER" }),
      User.countDocuments(), // Total users including admins
      Motorcycle.countDocuments(),
      Motorcycle.aggregate([
        { $unwind: "$categories" },
        { $group: { _id: "$categories", count: { $sum: 1 } } },
        { $project: { _id: 0, name: "$_id", value: "$count" } },
      ]),
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    const stats = {
      totalRevenue,
      totalBookings,
      totalCustomers,
      totalUsers, // Add total users count
      totalMotorcycles,
      motorcycleCategories,
    };

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Dashboard stats fetched successfully",
          stats,
        ),
      );
  },
);

export const getSalesOverview = asyncHandler(
  async (req: Request, res: Response) => {
    const { year, month, fromDate, toDate } = req.query;

    if (fromDate && toDate) {
      const data = await getSalesForDateRange(
        fromDate as string,
        toDate as string,
      );
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            true,
            "Sales data for the specified range fetched successfully.",
            data,
          ),
        );
    }

    if (month && year) {
      const data = await getWeeklySalesForMonth(
        parseInt(year as string),
        parseInt(month as string),
      );
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            true,
            `Weekly sales data for ${month}/${year} fetched successfully.`,
            data,
          ),
        );
    }

    // Default case: Get the full yearly overview
    const queryYear = year
      ? parseInt(year as string)
      : new Date().getFullYear();
    const data = await getYearlySalesOverview(queryYear);
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          `Sales overview for ${queryYear} fetched successfully.`,
          data,
        ),
      );
  },
);

const addBookingByAdmin = asyncHandler(async (req: Request, res: Response) => {
  const bookingData = req.body;
  const { customer } = req.body;

  // Check if a user with the provided email already exists
  let user = await User.findOne({ email: customer.email });

  // If user doesn't exist, create a new one with a placeholder password
  if (!user) {
    user = await User.create({
      email: customer.email,
      fullname: customer.fullname,
      username: customer.email, // Use email as username for simplicity
      password: `password_${new mongoose.Types.ObjectId()}`,
    });
  }

  const newBooking = await Booking.create({
    ...bookingData,
    customerId: user._id,
    customer: {
      fullname: user.fullname,
      email: user.email,
    },
    bookingDate: new Date(), // Set current date for admin-created bookings
  });

  if (!newBooking) {
    throw new ApiError(500, "Something went wrong while creating the booking");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        true,
        "Booking created successfully by admin",
        newBooking,
      ),
    );
});

const updateBookingByAdmin = asyncHandler(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const bookingData = req.body;

    const updatedBooking = await Booking.findByIdAndUpdate(
      bookingId,
      {
        $set: bookingData,
      },
      { new: true },
    );

    if (!updatedBooking) {
      throw new ApiError(404, "Booking not found");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Booking updated successfully",
          updatedBooking,
        ),
      );
  },
);

const cancelBookingByAdmin = asyncHandler(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params;
    const { cancellationReason } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      throw new ApiError(404, "Booking not found");
    }

    // Admins can cancel bookings in various states, but not already cancelled/completed
    if (["CANCELLED", "COMPLETED"].includes(booking.status)) {
      throw new ApiError(400, `Booking is already ${booking.status}`);
    }

    // Logic for refund amount can be added here if needed
    // For now, we just update the status and reason
    booking.status = "CANCELLED";
    booking.cancellationReason = cancellationReason;
    // booking.refundAmount = booking.paidAmount - booking.cancellationCharge;

    await booking.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json(
        new ApiResponse(200, true, "Booking cancelled successfully", booking),
      );
  },
);

const deleteBookingByAdmin = asyncHandler(
  async (req: Request, res: Response) => {
    const { bookingId } = req.params;

    const booking = await Booking.findByIdAndDelete(bookingId);

    if (!booking) {
      throw new ApiError(404, "Booking not found or already deleted");
    }

    // You might want to add logic here to delete associated data,
    // like reviews, if necessary.

    return res.status(200).json(
      new ApiResponse(200, true, "Booking deleted permanently", {
        _id: bookingId,
      }),
    );
  },
);

export {
  getAllBookings,
  modifyBooking,
  cancelBooking,
  generateRazorpayOrder,
  verifyRazorpayPayment,
  generatePaypalOrder,
  verifyPaypalPayment,
  updateBookingStatus,
  getAnalytics,
  addBookingByAdmin,
  updateBookingByAdmin,
  cancelBookingByAdmin,
  deleteBookingByAdmin,
};
