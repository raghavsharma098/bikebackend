/**
 * Admin Setup Script
 * Run this script ONCE to create a default admin user
 * Usage: POST /api/v1/admin/setup
 */

import asyncHandler from "../utils/async-handler";
import { User } from "../models/users.model";
import { ApiResponse } from "../utils/api-response";
import { ApiError } from "../utils/api-error";
import { UserRolesEnum, UserAuthType } from "../constants/constants";
import { Request, Response } from "express";

const setupAdminUser = asyncHandler(async (req: Request, res: Response) => {
  // Check if any admin user already exists
  const existingAdmin = await User.findOne({ role: UserRolesEnum.ADMIN });
  
  if (existingAdmin) {
    throw new ApiError(409, "Admin user already exists. Setup cannot be run again.");
  }

  // Check if the setup key is provided (basic security)
  const { setupKey } = req.body;
  const SETUP_KEY = process.env.ADMIN_SETUP_KEY || "TORQ_ADMIN_SETUP_2024";
  
  if (!setupKey || setupKey !== SETUP_KEY) {
    throw new ApiError(401, "Invalid setup key. Cannot create admin user.");
  }

  // Create default admin user
  const adminUser = await User.create({
    fullname: "TORQ Admin",
    email: "admin@torqrides.com",
    username: "admin",
    password: "TorqAdmin@2024", // Users should change this immediately
    role: UserRolesEnum.ADMIN,
    loginType: UserAuthType.CREDENTIALS,
    isEmailVerified: true, // Admin doesn't need email verification
  });

  const createdAdmin = await User.findById(adminUser._id).select(
    "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry"
  );

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        true,
        "Admin user created successfully! Please change the default password immediately.",
        {
          admin: createdAdmin,
          credentials: {
            username: "admin",
            email: "admin@torqrides.com",
            password: "TorqAdmin@2024",
            warning: "CHANGE PASSWORD IMMEDIATELY!"
          }
        }
      )
    );
});

export { setupAdminUser };
