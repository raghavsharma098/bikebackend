import { Router } from "express";
import {
  authenticateUser,
  verifyPermission,
} from "../middlewares/auth.middleware";
import { UserRolesEnum } from "../constants/constants";
import { validate } from "../middlewares/validator.middleware";
import {
  getUserCart,
  addOrUpdateMotorcycleToCart,
  removeMotorcycleFromCart,
  clearCart,
} from "../controllers/carts.controller";
import { mongoIdPathVariableValidator } from "../validators/common/mongodb/mongodb.validators";
import { addOrUpdateMotorcycleToCartValidator } from "../validators/carts.validator";

const router = Router();

router.use(authenticateUser);
router.use(verifyPermission([UserRolesEnum.CUSTOMER, UserRolesEnum.ADMIN]));

router.route("/").get(getUserCart);

router.route("/clear").delete(clearCart);

router
  .route("/item/:motorcycleId")
  .post(
    mongoIdPathVariableValidator("motorcycleId"),
    addOrUpdateMotorcycleToCartValidator(),
    validate,
    addOrUpdateMotorcycleToCart,
  )
  .delete(
    mongoIdPathVariableValidator("motorcycleId"),
    validate,
    removeMotorcycleFromCart,
  );

export default router;
