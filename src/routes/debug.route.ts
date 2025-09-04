import { Router } from "express";
import { debugCalculation } from "../controllers/debug.controller";
import { authenticateUser } from "../middlewares/auth.middleware";

const router = Router();

// Debug calculation route
router.route("/calculation").post(authenticateUser, debugCalculation);

export default router;
