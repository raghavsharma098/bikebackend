import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { CustomRequest, IUser, User } from "../models/users.model";
import asyncHandler from "../utils/async-handler";
import { ACCESS_TOKEN_SECRET } from "../utils/env";
import { ApiError } from "../utils/api-error";

const authenticateUser = asyncHandler(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    // Try multiple ways to get the token for better mobile compatibility
    let token;
    let tokenSource = "not found";
    
    // First check Authorization header as it's most reliable for mobile
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.replace("Bearer ", "");
      tokenSource = "authorization header";
    } 
    // Then try cookie (works best on desktop browsers)
    else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
      tokenSource = "cookie";
    }
    // Then try other fallback methods
    else {
      if (req.headers['x-access-token']) {
        token = req.headers['x-access-token'] as string;
        tokenSource = "x-access-token header";
      } else if (req.query.token) {
        token = req.query.token as string;
        tokenSource = "query parameter";
      }
    }
    
    // Check if request is from the production domain
    const isTorqRidesDomain = 
      req.headers.origin?.includes('torqrides.com') || 
      req.get('host')?.includes('torqrides.com');
      
    // Check if request is from a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      req.headers['user-agent'] || ''
    );
      
    // Log token source for debugging
    console.log("Auth token source:", tokenSource);
    
    // For debugging on mobile/production domain requests
    if (isTorqRidesDomain || isMobile) {
      console.log(`Auth debug - Token exists: ${!!token}, Mobile: ${isMobile}, Domain: ${isTorqRidesDomain}`);
      console.log(`Auth headers: ${JSON.stringify({
        authorization: req.headers.authorization ? 'exists' : 'missing',
        cookies: Object.keys(req.cookies || {}),
        origin: req.headers.origin,
        host: req.get('host')
      })}`);
    }
    
    // Special case for cart operations from the production domain or mobile devices
    if ((!token || !token.trim()) && 
        (isTorqRidesDomain || isMobile) && 
        req.originalUrl.includes('/carts')) {
      
      console.log("Production domain/mobile cart request without token - using guest session");
      
      // Better logging for debugging purposes
      console.log(`Device info: Mobile=${isMobile}, Domain=${isTorqRidesDomain}, Path=${req.originalUrl}`);
      console.log(`Headers: ${JSON.stringify({
        origin: req.headers.origin,
        host: req.get('host'),
        referer: req.headers.referer
      })}`);
      
      // For cart operations without a token, create a temporary guest user context
      req.user = {
        _id: 'guest',
        fullname: 'Guest User',
        email: 'guest@torqrides.com',
        username: 'guest',
        role: 'CUSTOMER',
      } as any;
      
      // Set a header to indicate guest status to the client
      res.set('X-User-Status', 'guest');
      
      return next();
    }
      
    if (!token?.trim()) {
      // Log the request details to help diagnose authentication issues
      console.log("Authentication failed - no token provided");
      console.log("Request path:", req.originalUrl);
      console.log("User agent:", req.headers['user-agent']);
      console.log("Origin:", req.headers.origin);
      console.log("Available cookies:", Object.keys(req.cookies || {}));
      
      throw new ApiError(401, "Session Expired !! Please login again");
    }

    const decodedToken = jwt.verify(token, ACCESS_TOKEN_SECRET!) as {
      _id: string;
    };

    if (!decodedToken) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await User.findById<IUser>(decodedToken._id).select(
      "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
    );

    if (!user) {
      throw new ApiError(404, "Account doesn't exist");
    }

    req.user = user;
    next();
  },
);

const verifyPermission = (roles: string[] = []) =>
  asyncHandler(
    async (req: CustomRequest, res: Response, next: NextFunction) => {
      if (!req.user?._id) {
        throw new ApiError(401, "Unauthorized");
      }
      if (roles.includes(req.user.role)) {
        next();
      } else {
        throw new ApiError(403, "Unauthorized action");
      }
    },
  );

export const avoidInProduction = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === "development") {
      next();
    } else {
      throw new ApiError(
        403,
        "This service is only available in the local environment.",
      );
    }
  },
);

export { authenticateUser, verifyPermission };
