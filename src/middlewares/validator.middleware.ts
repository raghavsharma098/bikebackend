import { validationResult } from "express-validator";
import { CustomRequest } from "../models/users.model";
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/api-error";

export const validate = (
  req: Request | CustomRequest,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);
  
  // Log the request body and validation errors for debugging
  console.log("Request Body:", req.body);
  
  if (errors.isEmpty()) {
    return next();
  }
  
  console.log("Validation Errors:", errors.array());
  
  throw new ApiError(
    400,
    "Validation Failed",
    errors.array(),
    false,
    errors.array(),
  );
};
