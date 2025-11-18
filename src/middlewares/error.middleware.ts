import mongoose from "mongoose";
import { ErrorRequestHandler, NextFunction, Request, Response } from "express";
import logger from "../loggers/winston.logger";
import { ApiError } from "../utils/api-error";
import { removeUnusedMulterImageFilesOnError } from "../utils/helper";


const errorHandler : ErrorRequestHandler = (err , req : Request, res : Response, next : NextFunction) => {
  let error = err;

  // Check if request is from a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    req.headers['user-agent'] || ''
  );
  
  // Special handling for cart operations from mobile devices
  if ((isMobile || req.headers.origin?.includes('torqrides.com')) && 
      req.originalUrl.includes('/carts') && 
      err.statusCode === 401) {
    console.log("Mobile/Production cart operation auth failure detected");
    console.log("User agent:", req.headers['user-agent']);
    console.log("Origin:", req.headers.origin);
    
    // Provide more helpful message for mobile cart operations
    error = new ApiError(401, "Please login again to add items to your cart", err?.errors || [], err.stack);
    
    // Add CORS headers directly in the error handler for this specific case
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin,X-Requested-With,Content-Type,Accept,Authorization');
  }
  // Check if the error is an instance of an ApiError class which extends native Error class
  else if (!(error instanceof ApiError)) {
    // if not
    // create a new ApiError instance to keep the consistency

    // assign an appropriate status code
    const statusCode =
      error.statusCode || error instanceof mongoose.Error ? 400 : 500;

    // set a message from native Error instance or a custom one
    const message = error.message || "Something went wrong";
    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  // Now we are sure that the `error` variable will be an instance of ApiError class
  const response = {
    ...error,
    message: error.message,
    ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}), // Error stack traces should be visible in development for debugging
  };

  logger.error(`${error.message}`);

  removeUnusedMulterImageFilesOnError(req);
  // Send error response
  res.status(error.statusCode).json(response);
  return;
};

export { errorHandler };
