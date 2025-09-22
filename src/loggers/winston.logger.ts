import winston from "winston";
import { MONGODB_NAME, NODE_ENV } from "../utils/env";

const { combine, timestamp, json, label, printf, colorize } = winston.format;

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

const productionFormat = combine(
  label({ label: MONGODB_NAME?.toUpperCase() + "-PRODUCTION" }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  json(),
);

const developmentFormat = combine(
  label({ label: MONGODB_NAME?.toUpperCase() + "-DEVELOPMENT" }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  json(),
  colorize({
    all: true,
    colors: {
      error: "red",
      warn: "yellow",
      info: "green",
      http: "magenta",
      verbose: "cyan",
      debug: "blue",
      silly: "gray",
    },
  }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaData = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `${timestamp} ${level} ${message} ${metaData} ${stack ?? ""}`;
  }),
);

let transports = [];

if (NODE_ENV !== "production") {
  transports.push(new winston.transports.Console());
} else {
  transports.push(
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
  );
  transports.push(
    new winston.transports.File({ filename: "logs/info.log", level: "info" }),
  );
  transports.push(
    new winston.transports.File({ filename: "logs/http.log", level: "http" }),
  );
}

const logger = winston.createLogger({
  level: NODE_ENV === "production" ? "warn" : "debug",
  levels,
  format: NODE_ENV === "production" ? productionFormat : developmentFormat,
  transports,
});

export default logger;
