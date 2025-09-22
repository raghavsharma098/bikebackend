import { body } from "express-validator";

const addOrUpdateMotorcycleToCartValidator = () => {
  return [
    body("quantity")
      .optional()
      .isInt({
        min: 1,
      })
      .withMessage("Quantity must be minimum 1"),

    body("pickupDate")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("Invalid pickup date"),
    body("dropoffDate")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("Invalid return date"),
    body("pickupTime").optional().isString().withMessage("Invalid pickup time"),
    body("dropoffTime")
      .optional()
      .isString()
      .withMessage("Invalid return time"),
  ];
};

export { addOrUpdateMotorcycleToCartValidator };
