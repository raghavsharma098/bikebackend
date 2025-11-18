import asyncHandler from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";
import { ApiError } from "../utils/api-error";
import { CustomRequest } from "../models/users.model";
import { Response } from "express";
import { Motorcycle } from "../models/motorcycles.model";
import { getBookingPeriod, calculateRent } from "../utils/pricing";

// Debug calculation endpoint
const debugCalculation = asyncHandler(async (req: CustomRequest, res: Response) => {
  const { motorcycleId, pickupDate, pickupTime, dropoffDate, dropoffTime, quantity = 1 } = req.body;

  const motorcycle = await Motorcycle.findById(motorcycleId);
  if (!motorcycle) {
    throw new ApiError(404, "Motorcycle not found");
  }

  const pickupDateTime = new Date(pickupDate);
  const [pickupHours, pickupMinutes] = pickupTime.split(":").map(Number);
  pickupDateTime.setHours(pickupHours, pickupMinutes, 0, 0);

  const dropoffDateTime = new Date(dropoffDate);
  const [dropoffHours, dropoffMinutes] = dropoffTime.split(":").map(Number);
  dropoffDateTime.setHours(dropoffHours, dropoffMinutes, 0, 0);

  const diff = dropoffDateTime.getTime() - pickupDateTime.getTime();
  const totalHours = diff / (1000 * 60 * 60);
  const fullDays = Math.floor(totalHours / 24);
  const extraHours = totalHours % 24;

  // Use the same logic as the main booking calculation
  const bookingPeriod = getBookingPeriod(
    new Date(pickupDate),
    pickupTime,
    new Date(dropoffDate),
    dropoffTime,
  );

  // Calculate rent using the new pricing logic
  const calculatedRent = calculateRent(
    bookingPeriod,
    motorcycle.pricePerDayMonThu,
    motorcycle.pricePerDayFriSun
  );

  // Calculate extra hours cost for display
  let extraHoursCost = 0;
  if (bookingPeriod.extraHours > 0) {
    // Use weekend rate for extra hours if they fall on weekend, otherwise weekday rate
    const extraHoursDailyRate = bookingPeriod.lastDayTypeForExtraHours === "weekend" ? motorcycle.pricePerDayFriSun : motorcycle.pricePerDayMonThu;
    extraHoursCost = Math.ceil(bookingPeriod.extraHours) * (extraHoursDailyRate * 0.10);
  }

  const totalRent = calculatedRent * quantity;
  
  const debugInfo = {
    motorcycle: {
      model: motorcycle.model,
      weekdayRate: motorcycle.pricePerDayMonThu,
      weekendRate: motorcycle.pricePerDayFriSun
    },
    booking: {
      pickupDateTime: pickupDateTime.toISOString(),
      dropoffDateTime: dropoffDateTime.toISOString(),
      totalHours,
      fullDays,
      extraHours,
      quantity
    },
    calculation: {
      weekdayCount: bookingPeriod.weekdayCount,
      weekendCount: bookingPeriod.weekendCount,
      extraHours: bookingPeriod.extraHours,
      extraHoursCost,
      weekdayTotal: bookingPeriod.weekdayCount * motorcycle.pricePerDayMonThu,
      weekendTotal: bookingPeriod.weekendCount * motorcycle.pricePerDayFriSun,
      subtotal: calculatedRent,
      totalRent,
      dayBreakdown: bookingPeriod.dayBreakdown.map(day => ({
        ...day,
        rate: day.isWeekday ? motorcycle.pricePerDayMonThu : motorcycle.pricePerDayFriSun,
        charge: day.isWeekday ? motorcycle.pricePerDayMonThu : motorcycle.pricePerDayFriSun
      }))
    }
  };

  return res.status(200).json(new ApiResponse(200, true, "Debug calculation successful", debugInfo));
});

export { debugCalculation };
