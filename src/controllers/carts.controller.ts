import asyncHandler from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";
import { ApiError } from "../utils/api-error";
import { CustomRequest } from "../models/users.model";
import { Response } from "express";
import {
  Motorcycle,
  MotorcycleCategoryEnum,
} from "../models/motorcycles.model";
import { Cart, ICartItem } from "../models/carts.model";
import mongoose from "mongoose";
import { PromoCodeTypeEnum } from "../constants/constants";
import { getBookingPeriod, calculateRent } from "../utils/pricing";

const applyDiscountsAndCalculateTotals = (cart: any) => {
  // Initialize all items with their original rent amounts first
  cart.items.forEach((item: ICartItem) => {
    item.discountedRentAmount = item.rentAmount;
    // Calculate tax on original amount initially
    item.totalTax = item.rentAmount * (item.taxPercentage / 100);
  });

  // Calculate initial totals without discount
  cart.rentTotal = cart.items.reduce(
    (sum: number, item: ICartItem) => sum + item.rentAmount,
    0,
  );

  // If no coupon is applied, return cart with original amounts
  if (!cart || !cart.coupon) {
    cart.totalTax = cart.items.reduce(
      (sum: number, item: ICartItem) => sum + item.totalTax,
      0,
    );
    cart.discountedRentTotal = cart.rentTotal + cart.totalTax;
    cart.discountedTotal =
      cart.rentTotal + cart.totalTax + cart.securityDepositTotal;
    return cart;
  }

  const { items, coupon } = cart;
  const totalOriginalRent = cart.rentTotal;

  // Apply coupon discounts
  if (coupon.type === PromoCodeTypeEnum.PERCENTAGE) {
    items.forEach((item: ICartItem) => {
      const discount = item.rentAmount * (coupon.discountValue / 100);
      item.discountedRentAmount = Math.max(0, item.rentAmount - discount);
      // Recalculate tax based on the discounted rent
      item.totalTax = item.discountedRentAmount * (item.taxPercentage / 100);
    });
  } else if (coupon.type === PromoCodeTypeEnum.FLAT) {
    let remainingDiscount = coupon.discountValue;
    let totalRentForDistribution = totalOriginalRent;

    // First pass: distribute discount proportionally
    items.forEach((item: ICartItem) => {
      if (remainingDiscount <= 0) return;
      
      // Distribute discount proportionally based on rent amount
      const proportion = item.rentAmount / totalRentForDistribution;
      let discountForItem = Math.min(
        remainingDiscount * proportion,
        item.rentAmount // Cap at item's rent amount
      );

      item.discountedRentAmount = Math.max(0, item.rentAmount - discountForItem);
      item.totalTax = item.discountedRentAmount * (item.taxPercentage / 100);

      remainingDiscount -= discountForItem;
    });

    // Second pass: redistribute any leftover discount
    if (remainingDiscount > 0) {
      for (const item of items) {
        if (remainingDiscount <= 0) break;
        
        const maxAdditionalDiscount = item.discountedRentAmount; // Can't discount below 0
        const discountToApply = Math.min(remainingDiscount, maxAdditionalDiscount);

        item.discountedRentAmount -= discountToApply;
        item.totalTax = item.discountedRentAmount * (item.taxPercentage / 100);
        remainingDiscount -= discountToApply;
      }
    }
  }

  // Calculate final totals after discount
  const finalDiscountedRent = items.reduce(
    (sum: number, item: ICartItem) => sum + item.discountedRentAmount,
    0,
  );
  
  cart.totalTax = items.reduce(
    (sum: number, item: ICartItem) => sum + item.totalTax,
    0,
  );
  
  cart.discountedRentTotal = finalDiscountedRent + cart.totalTax;
  cart.discountedTotal = finalDiscountedRent + cart.totalTax + cart.securityDepositTotal;

  return cart;
};

export const getCart = async (customerId: string) => {
  console.log("CART DEBUG: getCart called for customerId:", customerId);
  
  // First check raw cart data from database before cleanup
  const rawCartBefore = await Cart.findOne({ customerId: new mongoose.Types.ObjectId(customerId) });
  console.log("CART DEBUG: Raw cart before cleanup:", {
    exists: !!rawCartBefore,
    itemsCount: rawCartBefore?.items?.length || 0,
  });

  // Only remove items that are truly expired (pickup date is more than 24 hours in the past from the booking creation time)
  // For now, let's disable this cleanup to avoid removing valid cart items
  // await Cart.findOneAndUpdate(
  //   { customerId: new mongoose.Types.ObjectId(customerId) },
  //   {
  //     $pull: {
  //       items: {
  //         pickupDate: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  //       },
  //     },
  //   },
  //   { new: true },
  // );

  // Check raw cart data after cleanup (currently no cleanup)
  const rawCartAfter = await Cart.findOne({ customerId: new mongoose.Types.ObjectId(customerId) });
  console.log("CART DEBUG: Raw cart after cleanup:", {
    exists: !!rawCartAfter,
    itemsCount: rawCartAfter?.items?.length || 0,
  });

  const cartAggregation = await Cart.aggregate([
    { $match: { customerId: new mongoose.Types.ObjectId(customerId) } },
    { $unwind: { path: "$items", preserveNullAndEmptyArrays: true } },
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
      $lookup: {
        from: "promocodes",
        localField: "couponId",
        foreignField: "_id",
        as: "coupon",
      },
    },
    { $addFields: { coupon: { $arrayElemAt: ["$coupon", 0] } } },
    {
      $group: {
        _id: "$_id",
        customerId: { $first: "$customerId" },
        couponId: { $first: "$couponId" },
        coupon: { $first: "$coupon" },
        items: { $push: "$items" },
        securityDepositTotal: {
          $sum: {
            $multiply: ["$items.motorcycle.securityDeposit", "$items.quantity"],
          },
        },
      },
    },
  ]);

  if (!cartAggregation.length || !cartAggregation[0]._id) {
    return {
      _id: null,
      items: [],
      rentTotal: 0,
      securityDepositTotal: 0,
      totalTax: 0,
      cartTotal: 0,
      discountedTotal: 0,
    };
  }

  // If cart is empty, items array will contain one empty object, filter it out
  if (
    cartAggregation[0].items.length === 1 &&
    !cartAggregation[0].items[0].motorcycleId
  ) {
    cartAggregation[0].items = [];
  }
  // Apply discount logic in code
  const calculatedCart = applyDiscountsAndCalculateTotals(cartAggregation[0]);

  // Final calculation for cartTotal (pre-discount)
  calculatedCart.cartTotal =
    calculatedCart.rentTotal +
    calculatedCart.totalTax +
    calculatedCart.securityDepositTotal;

  return calculatedCart;
};

const getUserCart = asyncHandler(async (req: CustomRequest, res: Response) => {
  // Check if this is a guest user (from mobile/production domain)
  if (req.user._id === 'guest') {
    // Return empty cart for guest users
    console.log("Returning empty cart for guest user");
    return res
      .status(200)
      .json(new ApiResponse(200, true, "Guest cart fetched successfully", {
        items: [],
        totalPrice: 0,
        totalItems: 0,
        promoCode: null,
        discount: 0,
        finalPrice: 0,
        checkoutEligible: false,
      }));
  }
  
  // Normal flow for authenticated users
  console.log("CART DEBUG: Getting cart for user:", req.user.email);
  let cart = await getCart(req.user._id as string);
  console.log("CART DEBUG: Cart retrieved, items count:", cart?.items?.length || 0);
  console.log("CART DEBUG: Cart total:", cart?.cartTotal || 0);

  return res
    .status(200)
    .json(new ApiResponse(200, true, "Cart fetched successfully", cart));
});

const addOrUpdateMotorcycleToCart = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    // Check if this is a guest user (from mobile/production domain)
    if (req.user._id === 'guest') {
      console.log("Guest user attempting to add to cart - redirecting to login");
      return res
        .status(200)
        .json(new ApiResponse(
          200, 
          false, 
          "Please log in to add items to your cart", 
          { 
            needsLogin: true,
            redirectToLogin: true
          }
        ));
    }
  
    const {
      quantity,
      pickupDate,
      dropoffDate,
      pickupTime,
      dropoffTime,
      pickupLocation,
      dropoffLocation,
    }: Omit<
      ICartItem,
      | "duration"
      | "taxPercentage"
      | "totalTax"
      | "rentAmount"
      | "discountedRentAmount"
    > = req.body;

    const { motorcycleId } = req.params;

    const motorcycle = await Motorcycle.findById(motorcycleId);

    if (!motorcycle) {
      throw new ApiError(404, "Motorcycle not found");
    }

    const availableQuantity =
      motorcycle.availableInCities.find(
        (location) => location.branch === pickupLocation,
      )?.quantity ?? 0;

    if (availableQuantity < Number(quantity)) {
      throw new ApiError(
        400,
        availableQuantity > 0
          ? `Only ${availableQuantity} motorcycles available`
          : `Motorcycle is Out of Stock`,
      );
    }

    const pickupDateTime = new Date(pickupDate);
    const [pickupHours, pickupMinutes] = pickupTime.split(":").map(Number);
    pickupDateTime.setHours(pickupHours, pickupMinutes, 0, 0);

    const dropoffDateTime = new Date(dropoffDate);
    const [dropoffHours, dropoffMinutes] = dropoffTime.split(":").map(Number);
    dropoffDateTime.setHours(dropoffHours, dropoffMinutes, 0, 0);

    const totalDurationHours =
      (dropoffDateTime.getTime() - pickupDateTime.getTime()) / (1000 * 60 * 60);

    if (totalDurationHours < 6) {
      throw new ApiError(400, "Minimum booking duration is 6 hours.");
    }

    const bookingPeriod = getBookingPeriod(
      new Date(pickupDate),
      pickupTime,
      new Date(dropoffDate),
      dropoffTime,
    );

    // Calculate rent based on weekday/weekend pricing
    const calculatedRent = calculateRent(
      bookingPeriod,
      motorcycle.pricePerDayMonThu,
      motorcycle.pricePerDayFriSun
    );

    const rentAmount = calculatedRent * quantity;
    const taxPercentage = 18; // Fixed 18% GST as per new requirements
    const totalTax = rentAmount * (taxPercentage / 100);

    const cartItemPayload: ICartItem = {
      motorcycleId: new mongoose.Types.ObjectId(motorcycleId),
      quantity,
      pickupDate: new Date(pickupDate),
      dropoffDate: new Date(dropoffDate),
      pickupTime,
      dropoffTime,
      pickupLocation,
      dropoffLocation,
      duration: bookingPeriod.duration,
      totalHours: bookingPeriod.totalHours,
      rentAmount,
      taxPercentage,
      totalTax,
      discountedRentAmount: rentAmount,
    };

    const cart = await Cart.findOne({ customerId: req.user._id });
    console.log("CART DEBUG: Found existing cart:", !!cart);

    if (!cart) {
      console.log("CART DEBUG: Creating new cart for user");
      const newCart = await Cart.create({
        customerId: req.user._id,
        items: [cartItemPayload],
      });
      console.log("CART DEBUG: New cart created:", !!newCart);
    } else {
      const existingItemIndex = cart.items.findIndex(
        (item) => item.motorcycleId.toString() === motorcycleId.toString(),
      );
      console.log("CART DEBUG: Existing item index:", existingItemIndex);

      if (existingItemIndex > -1) {
        console.log("CART DEBUG: Updating existing item");
        cart.items[existingItemIndex] = cartItemPayload;
      } else {
        console.log("CART DEBUG: Adding new item to cart");
        cart.items.push(cartItemPayload);
      }

      if (cart.couponId) cart.couponId = null;
      console.log("CART DEBUG: Saving cart, items count:", cart.items.length);
      console.log("CART DEBUG: Cart items before save:", JSON.stringify(cart.items, null, 2));
      
      try {
        const savedCart = await cart.save({ validateBeforeSave: false });
        console.log("CART DEBUG: Cart saved successfully, items count after save:", savedCart.items.length);
      } catch (error) {
        console.error("CART DEBUG: Error saving cart:", error);
        throw error;
      }
    }

    const finalCart = await getCart(req.user._id as string);
    console.log("CART DEBUG: Final cart after save, items count:", finalCart?.items?.length || 0);

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Cart updated successfully", finalCart));
  },
);

const removeMotorcycleFromCart = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    // Check if this is a guest user (from mobile/production domain)
    if (req.user._id === 'guest') {
      console.log("Guest user attempting to remove from cart - redirecting to login");
      return res
        .status(200)
        .json(new ApiResponse(
          200, 
          false, 
          "Please log in to manage your cart", 
          { 
            needsLogin: true,
            redirectToLogin: true
          }
        ));
    }
  
    const { motorcycleId } = req.params;

    const motorcycle = await Motorcycle.findById(motorcycleId);

    if (!motorcycle) {
      throw new ApiError(404, "Motorcycle not found");
    }

    const updatedCart = await Cart.findOneAndUpdate(
      { customerId: req.user._id },
      { $pull: { items: { motorcycleId } } },
      { new: true },
    );

    if (!updatedCart) {
      throw new ApiError(404, "Cart not found");
    }

    let finalCart = await getCart(req.user._id as string);

    // If cart has a coupon applied, check if cart still meets minimum value requirement
    if (
      finalCart &&
      finalCart.coupon &&
      finalCart.rentTotal + finalCart.totalTax + finalCart.securityDepositTotal < finalCart.coupon.minimumCartValue
    ) {
      // Remove coupon if cart no longer meets minimum requirement
      await Cart.findOneAndUpdate(
        { customerId: req.user._id },
        { $set: { couponId: null } },
        { new: true }
      );
      
      // Get cart again after removing coupon
      finalCart = await getCart(req.user._id as string);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Cart updated successfully", finalCart));
  },
);

const clearCart = asyncHandler(async (req: CustomRequest, res: Response) => {
  // Check if this is a guest user (from mobile/production domain)
  if (req.user._id === 'guest') {
    console.log("Guest user attempting to clear cart - redirecting to login");
    return res
      .status(200)
      .json(new ApiResponse(
        200, 
        false, 
        "Please log in to manage your cart", 
        { 
          needsLogin: true,
          redirectToLogin: true
        }
      ));
  }
  await Cart.findOneAndUpdate(
    { customerId: req.user._id },
    {
      $set: {
        items: [],
        couponId: null,
      },
    },
    { new: true },
  );
  const cart = await getCart(req.user._id as string);

  return res
    .status(200)
    .json(new ApiResponse(200, true, "Cart has been cleared", cart));
});

export {
  getUserCart,
  addOrUpdateMotorcycleToCart,
  removeMotorcycleFromCart,
  clearCart,
};
