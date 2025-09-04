import { body } from "express-validator";
import {
  AvailableInCities,
  AvailableMotorcycleStatus,
} from "../models/motorcycles.model";

export const createMotorcycleLogValidator = () => {
  return [
    body("registrationNumber")
      .isString()
      .trim()
      .notEmpty()
      .withMessage(
        "Registration Number of Motorcycle is required to maintainance.",
      ),
    body("branch").isIn(AvailableInCities).withMessage("Branch is required"),
    body("dateIn")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("Date-In must be a valid date"),
    body("serviceCentreName")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Service Centre Name is required"),
    body("thingsToDo.odoReading")
      .isNumeric()
      .withMessage("odoReading must be a number"),
    body("thingsToDo.scheduledService").optional().isBoolean(),
    body("thingsToDo.brakePads").optional().isBoolean(),
    body("thingsToDo.chainSet").optional().isBoolean(),
    body("thingsToDo.damageRepair").optional().isBoolean(),
    body("thingsToDo.damageDetails").optional().isString().trim(),
    body("thingsToDo.clutchWork").optional().isBoolean(),
    body("thingsToDo.clutchDetails").optional().isString().trim(),
    body("thingsToDo.other").optional().isBoolean(),
    body("thingsToDo.otherDetails").optional().isString().trim(),
    body("status")
      .optional()
      .isIn(AvailableMotorcycleStatus)
      .withMessage(
        `Status must be one of the following: ${AvailableMotorcycleStatus.join(", ")}`,
      ),
    body("dateOut")
      .optional()
      .isISO8601()
      .toDate()
      .withMessage("dateIn must be a valid date"),
    body("billAmount").optional().isNumeric(),
    body("isAvailable").optional().isBoolean(),
  ];
};

export const updateMotorcycleLogValidator = () => {
  return [
    ...createMotorcycleLogValidator().map((validator) => validator.optional()),
  ];
};
