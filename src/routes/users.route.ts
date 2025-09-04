import { Router } from "express";
import {
  userRegister,
  userLogin,
  userLogout,
  verifyEmail,
  resendVerificationEmail,
  refreshAccessToken,
  forgotPasswordRequest,
  resetForgottenPassword,
  changeCurrentPassword,
  assignRole,
  getCurrentUser,
  changeAvatar,
  deleteUserAccount,
  uploadUserDocument,
  updateUserProfile,
  getAllUsers,
  deleteUserDocument,
} from "../controllers/users.controller";
import { validate } from "../middlewares/validator.middleware";
import {
  uploadUserDocumentValidator,
  userAssignRoleValidator,
  userChangeCurrentPasswordValidator,
  userForgotPasswordRequestValidator,
  userLoginValidation,
  userRegisterValidation,
  userResetForgottenPasswordValidator,
} from "../validators/users.validator";
import {
  authenticateUser,
  verifyPermission,
} from "../middlewares/auth.middleware";
import { mongoIdPathVariableValidator } from "../validators/common/mongodb/mongodb.validators";
import { UserRolesEnum } from "../constants/constants";
import { upload } from "../middlewares/multer.middleware";

const router = Router();

router.route("/").get(authenticateUser, getCurrentUser);
router
  .route("/register")
  .post(userRegisterValidation(), validate, userRegister);

router.route("/login").post(userLoginValidation(), validate, userLogin);

router.route("/logout").post(authenticateUser, userLogout);

router.route("/refresh-tokens").post(refreshAccessToken);

router.route("/verify").get(verifyEmail);

router
  .route("/forgot-password")
  .post(userForgotPasswordRequestValidator(), validate, forgotPasswordRequest);

router
  .route("/reset-password")
  .post(
    userResetForgottenPasswordValidator(),
    validate,
    resetForgottenPassword,
  );

router
  .route("/profile/change-avatar")
  .post(authenticateUser, upload.single("avatar"), changeAvatar);

router
  .route("/profile/resend-verification-email")
  .post(authenticateUser, resendVerificationEmail);

router
  .route("/profile/change-current-password")
  .post(
    authenticateUser,
    userChangeCurrentPasswordValidator(),
    validate,
    changeCurrentPassword,
  );
router
  .route("/profile/update-profile")
  .post(authenticateUser, updateUserProfile);
router
  .route("/profile/upload-documents")
  .post(authenticateUser, upload.single("document"), uploadUserDocument);
router
  .route("/profile/delete-document/:documentId")
  .delete(
    authenticateUser,
    mongoIdPathVariableValidator("documentId"),
    deleteUserDocument,
  );

router
  .route("/:userId")
  .delete(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("userId"),
    deleteUserAccount,
  );

router
  .route("/profile/assign-role/:userId")
  .post(
    authenticateUser,
    verifyPermission([UserRolesEnum.ADMIN]),
    mongoIdPathVariableValidator("userId"),
    userAssignRoleValidator(),
    validate,
    assignRole,
  );

router
  .route("/all-users")
  .get(authenticateUser, verifyPermission([UserRolesEnum.ADMIN]), getAllUsers);

export default router;
