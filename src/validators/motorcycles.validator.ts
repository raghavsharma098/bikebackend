import { body, query } from "express-validator";
import {
  AvailableInCities,
  AvailableMotorcycleCategories,
} from "../models/motorcycles.model";

const getAllMotorcyclesValidators = () => [
  query("make").optional().isString().withMessage("Make must be a valid data"),
  query("model")
    .optional()
    .isString()
    .withMessage("Model must be a valid data"),
  query("minPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("minPrice must be a positive number"),
  query("maxPrice")
    .optional()
    .isFloat({ min: 0 })
    .withMessage("maxPrice must be a positive number"),
  query("availableInCities")
    .optional()
    .isString()
    .withMessage("Invalid cities"),
];

const addOrUpdateMotorcycleValidators = () => {
  return [
    body("make")
      .exists({ checkNull: true })
      .withMessage("Make is required")
      .isString()
      .withMessage("Make must be a valid data"),

    body("vehicleModel")
      .exists({ checkNull: true })
      .withMessage("Model is required")
      .isString()
      .withMessage("Model must be a valid data"),

    body("pricePerDayMonThu")
      .isNumeric()
      .withMessage("Price per day (Mon-Thu) must be a number"),
    body("pricePerDayFriSun")
      .isNumeric()
      .withMessage("Price per day (Fri-Sun) must be a number"),
    body("pricePerWeek")
      .isNumeric()
      .withMessage("Price per week must be a number"),

    body("description")
      .exists({ checkNull: true })
      .withMessage("Description is required")
      .isString()
      .withMessage("Description must be a valid data"),

    body("categories")
      .exists({ checkNull: true })
      .withMessage("Category is required")
      .customSanitizer((val) => {
        try {
          if (!val) return {};
          return JSON.parse(val);
        } catch (err) {
          throw new Error("Categories must be valid data");
        }
      })
      .isArray({ min: 1 })
      .withMessage("Mark this motorcycle in at least one category")
      .custom((arr: any[]) =>
        arr.every((v) => AvailableMotorcycleCategories.includes(v)),
      )
      .withMessage(
        `Each category must be one of: ${AvailableMotorcycleCategories.join(", ")}`,
      ),

    body("availableInCities")
      .exists({ checkNull: true })
      .withMessage("availableInCities is required")
      .customSanitizer((val) => {
        try {
          if (!val) return {};
          return JSON.parse(val);
        } catch (err) {
          throw new Error("Branches must be valid data");
        }
      })
      .isArray({ min: 1 })
      .withMessage("Mark this motorcycle in at least one branch")
      .custom((arr: any[]) =>
        arr.every(
          (o: { branch: AvailableInCities; quantity: number }) =>
            o.branch &&
            AvailableInCities.includes(o.branch) &&
            Number.isInteger(o.quantity) &&
            o.quantity >= 0,
        ),
      )
      .withMessage(
        `Each entry must have branch one of: ${AvailableInCities.join(", ")} and quantity as a non-negative integer`,
      ),

    body("specs")
      .exists({ checkNull: true })
      .withMessage("Specifications is required")
      .custom((val) => !Array.isArray(val))
      .withMessage("Provide Valid Specifications")
      .customSanitizer((val) => {
        try {
          if (!val) return {};
          return JSON.parse(val);
        } catch (err) {
          throw new Error("Specifications must be valid data");
        }
      }),

    body("specs.engine")
      .exists({ checkNull: true })
      .withMessage("specs.engine is required")
      .isFloat({ min: 0 })
      .withMessage("specs.engine must be a non-negative number"),

    body("specs.power")
      .exists({ checkNull: true })
      .withMessage("specs.power is required")
      .isFloat({ min: 0 })
      .withMessage("specs.power must be a non-negative number"),

    body("specs.weight")
      .exists({ checkNull: true })
      .withMessage("specs.weight is required")
      .isFloat({ min: 0 })
      .withMessage("specs.weight must be a non-negative number"),

    body("specs.seatHeight")
      .exists({ checkNull: true })
      .withMessage("specs.seatHeight is required")
      .isFloat({ min: 0 })
      .withMessage("specs.seatHeight must be a non-negative number"),

    body("variant")
      .exists({ checkNull: true })
      .withMessage("variant is required")
      .isString()
      .withMessage("variant must be a valid data"),

    body("color")
      .exists({ checkNull: true })
      .withMessage("color is required")
      .isString()
      .withMessage("color must be a valid data"),

    body("securityDeposit")
      .exists({ checkNull: true })
      .withMessage("securityDeposit is required")
      .isFloat({ min: 0 })
      .withMessage("securityDeposit must be a non-negative number"),

    body("kmsLimitPerDay")
      .exists({ checkNull: true })
      .withMessage("kmsLimitPerDay is required")
      .isFloat({ min: 0 })
      .withMessage("kmsLimitPerDay must be a non-negative number"),

    body("extraKmsCharges")
      .exists({ checkNull: true })
      .withMessage("extraKmsCharges is required")
      .isFloat({ min: 0 })
      .withMessage("extraKmsCharges must be a non-negative number"),
  ];
};

export { addOrUpdateMotorcycleValidators, getAllMotorcyclesValidators };
