import { Router } from "express";
import { testEmail } from "../controllers/test.controller";
import { authenticateUser, verifyPermission } from "../middlewares/auth.middleware";

const router = Router();

// Public route for basic test
router.route("/email-test").post(testEmail);

// Protected route for authenticated users
router.route("/protected-email-test").post(authenticateUser, testEmail);

export default router;
