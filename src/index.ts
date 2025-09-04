import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./db/db";
import cookieParser from "cookie-parser";
import morganMiddleware from "./loggers/morgan.logger";
import logger from "./loggers/winston.logger";
import { errorHandler } from "./middlewares/error.middleware";

dotenv.config({
  path: "./.env",
});

const PORT = process.env.PORT || 6969;

const app = express();

app.use(
  cors({
    origin: function(origin, callback) {
      // Define all allowed origins
      const allowedOrigins = [
        process.env.CORS_ORIGIN!, 
        process.env.CLIENT_URL!,
        'https://bike-jnf7z6b41-gamec8821s-projects.vercel.app',  // Hardcoded Vercel URL
        'https://torq-rides.vercel.app',  // Common Vercel domain format
        'https://www.torqrides.com',      // Production domain
        'https://torqrides.com',          // Production domain without www
        'http://localhost:3000',          // For local development
        'https://gohive.work',            // Server domain for same-origin requests
        // Add any other domains that might be used as frontends
      ].filter(Boolean);
      
      // For debugging - log all origins and user agent
      console.log(`Request origin: ${origin || 'No origin'}`);
      
      // Allow requests with no origin (like mobile apps or curl requests)
      // Mobile browsers often don't include origin headers or use different origins
      if (!origin) {
        console.log('Request with no origin - likely mobile or direct request');
        callback(null, true);
      } else if (allowedOrigins.some(allowed => origin.indexOf(allowed) !== -1)) {
        console.log('Origin allowed:', origin);
        callback(null, true);
      } else {
        console.log(`Origin ${origin} not allowed by CORS, but allowing anyway for compatibility`);
        // Allow all origins for better mobile compatibility
        callback(null, true); 
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "Content-Length", 
      "X-Requested-With", 
      "X-Requested-From", 
      "X-Access-Token",
      "Accept",
      "Origin"
    ],
    exposedHeaders: ["set-cookie", "X-User-Status"],
    maxAge: 86400, // 24 hours in seconds
  }),
);

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morganMiddleware);

app.route("/").get((req: Request, res: Response) => {
  res.status(200).send("Server is running");
});

// Mobile diagnostic endpoint
app.route("/api/v1/mobile-check").get((req: Request, res: Response) => {
  // Check mobile status
  const userAgent = req.headers['user-agent'] || 'unknown';
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const origin = req.headers.origin || 'no-origin';
  const host = req.get('host') || 'unknown';
  
  // Get cookies
  const cookies = req.cookies || {};
  
  // Get token from various sources
  const authHeader = req.headers.authorization || 'none';
  
  res.status(200).json({
    success: true,
    isMobile,
    userAgent,
    origin,
    host,
    hasCookies: Object.keys(cookies).length > 0,
    cookieNames: Object.keys(cookies),
    hasAuthHeader: authHeader !== 'none',
    time: new Date().toISOString(),
    // Add a token in the response
    testToken: 'mobile-test-token-' + Date.now()
  });
});

// Mobile diagnostic endpoint
app.route("/api/v1/mobile-test").get((req: Request, res: Response) => {
  // Get user agent and other headers
  const userAgent = req.headers['user-agent'];
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];
  
  // Send back diagnostic information
  res.status(200).json({
    success: true,
    message: "Mobile compatibility test successful",
    diagnostics: {
      userAgent,
      origin,
      referer,
      headers: req.headers,
      cookies: req.cookies,
    }
  });
});

import healthCheckRouter from "./routes/healthcheck.route";
import authRouter from "./routes/users.route";
import motorcycleRouter from "./routes/motorcycles.route";
import bookingRouter from "./routes/bookings.route";
import reviewRouter from "./routes/reviews.route";
import couponRouter from "./routes/promo-codes.route";
import cartRouter from "./routes/carts.route";
import testRouter from "./routes/test.route";
import adminSetupRouter from "./routes/admin-setup.route";
import debugRouter from "./routes/debug.route";

app.use("/api/v1/healthcheck", healthCheckRouter);
app.use("/api/v1/users", authRouter);
app.use("/api/v1/motorcycles", motorcycleRouter);
app.use("/api/v1/bookings", bookingRouter);
app.use("/api/v1/reviews", reviewRouter);
app.use("/api/v1/coupons", couponRouter);
app.use("/api/v1/carts", cartRouter);
app.use("/api/v1/test", testRouter);
app.use("/api/v1/admin", adminSetupRouter);
app.use("/api/v1/debug", debugRouter);


console.log("Connecting to MongoDB...");
connectDB()
  .then(() => {
    console.log("MongoDB connected!");
    app.listen(PORT, () => {
      logger.info("⚙️  Server is running on PORT: " + process.env.PORT);
    });
  })
  .catch((error) => {
    logger.error("MongoDB Connection Error: ", error);
  });

app.use(errorHandler);
