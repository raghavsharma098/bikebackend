import { Router } from "express";
import { setupAdminUser } from "../controllers/admin-setup.controller";

const router = Router();

// Admin setup route - should only be used once
router.route("/setup").post(setupAdminUser);

export default router;
