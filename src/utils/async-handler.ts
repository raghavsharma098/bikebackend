import { NextFunction, Request, Response } from "express";

const asyncHandler = function (fn: Function) {
  return function (req: Request, res: Response, next: NextFunction) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
