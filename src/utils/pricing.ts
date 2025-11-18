export interface DayBreakdown {
  date: string;
  dayName: string;
  isWeekday: boolean;
  isPickupDay: boolean;
  isReturnDay: boolean;
  hours: number;
  rate: number;
  charge: number;
}

export interface BookingPeriod {
  totalHours: number;
  duration: string;
  weekdayCount: number;
  weekendCount: number;
  extraHours: number;
  lastDayTypeForExtraHours: "weekday" | "weekend";
  dayBreakdown: DayBreakdown[];
  totalRent: number;
}

export const getBookingPeriod = (
  pickupDate: Date,
  pickupTime: string,
  dropoffDate: Date,
  dropoffTime: string,
): BookingPeriod => {
  const pickupDateTime = new Date(pickupDate);
  const [pickupHours, pickupMinutes] = pickupTime.split(":").map(Number);
  pickupDateTime.setHours(pickupHours, pickupMinutes, 0, 0);

  const dropoffDateTime = new Date(dropoffDate);
  const [dropoffHours, dropoffMinutes] = dropoffTime.split(":").map(Number);
  dropoffDateTime.setHours(dropoffHours, dropoffMinutes, 0, 0);

  const diff = dropoffDateTime.getTime() - pickupDateTime.getTime();

  if (diff <= 0) {
    return {
      totalHours: 0,
      duration: "0 days 0 hours",
      weekdayCount: 0,
      weekendCount: 0,
      extraHours: 0,
      lastDayTypeForExtraHours: "weekday",
      dayBreakdown: [],
      totalRent: 0,
    };
  }

  const totalHours = diff / (1000 * 60 * 60);

  // Determine pricing type based on pickup day and time
  const pickupDay = pickupDateTime.getDay();
  const pickupHour = pickupDateTime.getHours();

  // helper to decide if a block starting at given datetime is weekend-priced
  const isWeekendBlockStart = (dt: Date): boolean => {
    const d = dt.getDay();
    const h = dt.getHours();
    if (d === 4 && h >= 16) return true; // Thu 4pm+
    if (d === 5 || d === 6) return true; // Fri, Sat
    if (d === 0) return true; // Sunday is also weekend
    return false;
  };

  let weekdayCount = 0;
  let weekendCount = 0;
  let extraHours = 0;
  let lastDayTypeForExtraHours: "weekday" | "weekend" = "weekday";

  // Calculate full days and extra hours
  const fullDays = Math.floor(totalHours / 24);
  const originalExtraHours = totalHours % 24;

  // For >28 hours (i.e., 29th hour onwards): count an additional full day
  // For 24-28 hours: Count only full days (extra hours are charged separately)
  const totalDaysToCharge = (totalHours > 28 && originalExtraHours > 0) ? fullDays + 1 : fullDays;

  // Always do day-by-day calculation based on actual calendar days & time
  let currentDate = new Date(pickupDateTime);

  for (let i = 0; i < totalDaysToCharge; i++) {
    if (isWeekendBlockStart(currentDate)) {
      weekendCount++;
    } else {
      weekdayCount++;
    }
    // advance exactly 24 hours for block starts
    currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
  }

  // For 24-28 hours, determine type for extra hours using the next block start
  if (totalHours > 24 && totalHours <= 28 && originalExtraHours > 0) {
    lastDayTypeForExtraHours = isWeekendBlockStart(currentDate) ? "weekend" : "weekday";
  }

  // Set extraHours for UI display: always show extra hours when they exist
  if (totalHours > 24) {
    extraHours = originalExtraHours; // Show extra hours for all multi-day bookings
  } else {
    extraHours = 0; // No extra hours for single day bookings
  }

  const days = Math.floor(totalHours / 24);
  const hours = Math.ceil(extraHours);
  const duration = hours > 0 ? `${days} days ${hours} hours` : `${days} days`;

  return {
    totalHours,
    duration,
    weekdayCount,
    weekendCount,
    extraHours,
    lastDayTypeForExtraHours,
    dayBreakdown: [],
    totalRent: 0,
  };
};

export const calculateRent = (
  bookingPeriod: BookingPeriod,
  weekdayRate: number,
  weekendRate: number
): number => {
  let calculatedRent = 0;

  // Handle 24-hour cycle billing logic
  if (bookingPeriod.totalHours <= 24) {
    calculatedRent = bookingPeriod.weekdayCount > 0 ? weekdayRate : weekendRate;
  } else if (bookingPeriod.totalHours <= 28) {
    // 24-28 hours: charge for actual days + extra hours (max 4 hours at 10% per hour)
    // Use weekend rate for extra hours if they fall on weekend, otherwise weekday rate
    const extraHoursDailyRate = bookingPeriod.lastDayTypeForExtraHours === "weekend" ? weekendRate : weekdayRate;
    calculatedRent = bookingPeriod.weekdayCount * weekdayRate + bookingPeriod.weekendCount * weekendRate;
    const extraHours = bookingPeriod.totalHours - (Math.floor(bookingPeriod.totalHours / 24) * 24);
    calculatedRent += Math.ceil(extraHours) * (extraHoursDailyRate * 0.10);
  } else {
    // >28 hours (from 29th hour): full days only, no extra hours
    calculatedRent = bookingPeriod.weekdayCount * weekdayRate + bookingPeriod.weekendCount * weekendRate;
  }

  return calculatedRent;
};
