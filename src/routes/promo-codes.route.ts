import { Router } from "express";
import {
  authenticateUser,
  verifyPermission,
} from "../middlewares/auth.middleware";
import { UserRolesEnum } from "../constants/constants";
import {
  applyCouponCodeValidator,
  couponActivityStatusValidator,
  createCouponValidator,
  updateCouponValidator,
} from "../validators/promo-codes.validator";

import { validate } from "../middlewares/validator.middleware";
import {
  applyCoupon,
  createCoupon,
  deleteCoupon,
  getAllCoupons,
  getCouponById,
  removeCouponFromCart,
  updateCoupon,
  updateCouponActiveStatus,
} from "../controllers/promo-codes.controller";
import { mongoIdPathVariableValidator } from "../validators/common/mongodb/mongodb.validators";

const router = Router();

router.use(authenticateUser);

router
  .route("/")
  .get(verifyPermission([UserRolesEnum.ADMIN]), getAllCoupons)
  .post(
    verifyPermission([UserRolesEnum.ADMIN]),
    createCouponValidator(),
    validate,
    createCoupon,
  );

router
  .route("/c/apply")
  .post(
    verifyPermission([UserRolesEnum.ADMIN, UserRolesEnum.CUSTOMER]),
    applyCouponCodeValidator(),
    validate,
    applyCoupon,
  );
router
  .route("/c/remove")
  .post(
    verifyPermission([UserRolesEnum.ADMIN, UserRolesEnum.CUSTOMER]),
    removeCouponFromCart,
  );

router
  .route("/:couponId")
  .get(
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("couponId"),
    validate,
    getCouponById,
  )
  .put(
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("couponId"),
    updateCouponValidator(),
    validate,
    updateCoupon,
  )
  .patch(
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("couponId"),
    couponActivityStatusValidator(),
    validate,
    updateCouponActiveStatus,
  )
  .delete(
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("couponId"),
    validate,
    deleteCoupon,
  );

export default router;
