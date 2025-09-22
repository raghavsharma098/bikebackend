import { body } from "express-validator";

const addNewReviewValidators = () => {
  return [
    body("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("comment")
      .optional()
      .isString()
      .withMessage("Comment must be a string"),
  ];
};

const updateReviewValidators = () => {
  return [
    body("rating")
      .optional()
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
    body("comment")
      .optional()
      .isString()
      .withMessage("Comment must be a string")
      .trim()
      .notEmpty()
      .isLength({ max: 1000 })
      .withMessage("Comment cannot exceed 1000 characters"),
  ];
};

export { addNewReviewValidators, updateReviewValidators };
