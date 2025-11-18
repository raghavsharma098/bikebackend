import { Router } from "express";
import {
  authenticateUser,
  verifyPermission,
} from "../middlewares/auth.middleware";
import { UserRolesEnum } from "../constants/constants";
import { upload } from "../middlewares/multer.middleware";
import {
  addOrUpdateMotorcycleValidators,
  getAllMotorcyclesValidators,
} from "../validators/motorcycles.validator";
import { validate } from "../middlewares/validator.middleware";
import {
  getAllMotorcycles,
  getMotorcycleById,
  addMotorcycle,
  updateMotorcycleDetails,
  deleteMotorcycle,
  deleteMotorcycleImage,
  getAllFilters,
} from "../controllers/motorcycles.controller";
import logsRouter from "./motorcycle-logs.route";
import { mongoIdPathVariableValidator } from "../validators/common/mongodb/mongodb.validators";

const router = Router();

router
  .route("/")
  .get(getAllMotorcyclesValidators(), validate, getAllMotorcycles)
  .post(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    upload.array("images", 5),
    addOrUpdateMotorcycleValidators(),
    validate,
    addMotorcycle,
  );
router.route("/filters").get(getAllFilters);

router.use("/logs", logsRouter);

router
  .route("/:motorcycleId")
  .get(
    mongoIdPathVariableValidator("motorcycleId"),
    validate,
    getMotorcycleById,
  )
  .patch(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("motorcycleId"),
    validate,
    deleteMotorcycleImage,
  )
  .put(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    upload.array("images", 5),
    mongoIdPathVariableValidator("motorcycleId"),
    addOrUpdateMotorcycleValidators(),
    validate,
    updateMotorcycleDetails,
  )
  .delete(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("motorcycleId"),
    validate,
    deleteMotorcycle,
  );

export default router;
