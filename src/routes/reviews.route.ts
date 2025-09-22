import { Router } from "express";
import {
  authenticateUser,
  verifyPermission,
} from "../middlewares/auth.middleware";
import {
  addNewReviewValidators,
  updateReviewValidators,
} from "../validators/reviews.validator";
import { validate } from "../middlewares/validator.middleware";
import {
  getAllReviewsOfMotorcycleById,
  addNewReviewToBookingId,
  updateReviewById,
  deleteReviewById,
} from "../controllers/reviews.controller";
import { UserRolesEnum } from "../constants/constants";
import { mongoIdPathVariableValidator } from "../validators/common/mongodb/mongodb.validators";

const router = Router();

router
  .route("/:motorcycleId")
  .get(
    mongoIdPathVariableValidator("motorcycleId"),
    getAllReviewsOfMotorcycleById,
  );
router
  .route("/:bookingId")
  .post(
    authenticateUser,
    verifyPermission([UserRolesEnum.CUSTOMER]),
    mongoIdPathVariableValidator("bookingId"),
    addNewReviewValidators(),
    validate,
    addNewReviewToBookingId,
  );

router
  .route("/:reviewId")
  .put(
    authenticateUser,
    verifyPermission([UserRolesEnum.CUSTOMER]),
    mongoIdPathVariableValidator("reviewId"),
    updateReviewValidators(),
    validate,
    updateReviewById,
  )
  .delete(
    authenticateUser,
    verifyPermission([UserRolesEnum.CUSTOMER, UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("reviewId"),
    deleteReviewById,
  );

export default router;
