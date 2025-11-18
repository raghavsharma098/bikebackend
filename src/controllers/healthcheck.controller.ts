import { Request, Response } from "express";
import asyncHandler from "../utils/async-handler";

const checkHealth = asyncHandler((req: Request, res: Response) => {
  res.status(200).json({
    status: "success",
    message: "Server is running",
  });
});

export default checkHealth;
