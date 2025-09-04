import { Router } from "express";
import {
  authenticateUser,
  verifyPermission,
} from "../middlewares/auth.middleware";
import { UserRolesEnum } from "../constants/constants";
import {
  getAllBookingsValidators,
  createBookingValidators,
  modifyBookingValidators,
  verifyRazorpayPaymentValidator,
  verifyPaypalPaymentValidator,
} from "../validators/bookings.validator";
import { validate } from "../middlewares/validator.middleware";
import {
  getAllBookings,
  modifyBooking,
  cancelBooking,
  generateRazorpayOrder,
  verifyRazorpayPayment,
  generatePaypalOrder,
  verifyPaypalPayment,
  updateBookingStatus,
  getDashboardStats,
  getSalesOverview,
  getAnalytics,
  addBookingByAdmin,
  updateBookingByAdmin,
  cancelBookingByAdmin,
  deleteBookingByAdmin,
} from "../controllers/bookings.controller";
import {
  mongoIdPathVariableValidator,
  mongoIdRequestBodyValidator,
} from "../validators/common/mongodb/mongodb.validators";

const router = Router();

router.use(authenticateUser);

router
  .route("/")
  .get(
    verifyPermission([UserRolesEnum.CUSTOMER, UserRolesEnum.ADMIN]),
    getAllBookingsValidators(),
    validate,
    getAllBookings,
  )
  .post(verifyPermission([UserRolesEnum.ADMIN]), addBookingByAdmin);

router
  .route("/stats")
  .get(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    getDashboardStats,
  );
router
  .route("/sales-overview")
  .get(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    getSalesOverview,
  );

router
  .route("/analytics")
  .get(verifyPermission([UserRolesEnum.ADMIN]), getAnalytics);

router
  .route("/:bookingId")
  .put(
    verifyPermission([UserRolesEnum.ADMIN]),
    modifyBookingValidators(),
    validate,
    modifyBooking,
  )
  .delete(
    verifyPermission([UserRolesEnum.ADMIN, UserRolesEnum.CUSTOMER]),
    mongoIdPathVariableValidator("bookingId"),
    validate,
    cancelBooking,
  );

router.route("/provider/razorpay").post(generateRazorpayOrder);
router.route("/provider/paypal").post(generatePaypalOrder);

router
  .route("/:bookingId/admin")
  .put(
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("bookingId"),
    validate,
    updateBookingByAdmin,
  )
  .patch(
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("bookingId"),
    validate,
    cancelBookingByAdmin,
  )
  .delete(
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("bookingId"),
    validate,
    deleteBookingByAdmin,
  );

router
  .route("/provider/razorpay/verify-payment")
  .post(verifyRazorpayPaymentValidator(), validate, verifyRazorpayPayment);

router
  .route("/provider/paypal/verify-payment")
  .post(verifyPaypalPaymentValidator(), validate, verifyPaypalPayment);

export default router;
