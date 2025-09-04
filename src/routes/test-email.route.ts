import { Router } from "express";
import { testEmail } from "../controllers/test-email.controller";
import { avoidInProduction } from "../middlewares/auth.middleware";

const router = Router();

// Use avoidInProduction middleware to prevent test emails in production
router.route("/").post(avoidInProduction, testEmail);

export default router;
