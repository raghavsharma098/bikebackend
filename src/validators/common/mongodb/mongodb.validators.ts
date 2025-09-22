import { body, param } from "express-validator";

const mongoIdPathVariableValidator = (_id: string) => {
  return [param(_id).notEmpty().isMongoId().withMessage(`Invalid ${_id}`)];
};

const mongoIdRequestBodyValidator = (_id: string) => {
  return [body(_id).notEmpty().isMongoId().withMessage(`Invalid ${_id}`)];
};

export { mongoIdPathVariableValidator, mongoIdRequestBodyValidator };
