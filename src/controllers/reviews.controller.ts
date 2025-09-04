import asyncHandler from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";
import { ApiError } from "../utils/api-error";
import { Review } from "../models/reviews.model";
import { Booking, BookingStatusEnum } from "../models/bookings.model";
import { CustomRequest } from "../models/users.model";
import { Response } from "express";
import { UserRolesEnum } from "../constants/constants";
import mongoose, { isValidObjectId } from "mongoose";

const getAllReviewsOfMotorcycleById = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { motorcycleId } = req.params;

    if (!isValidObjectId(motorcycleId)) {
      throw new ApiError(400, "Invalid Motorcycle Id");
    }

    const { page, offset } = req.query;

    const pageNum = Number.isNaN(Number(page)) ? 1 : Math.max(Number(page), 1);
    const limit = Number.isNaN(Number(offset))
      ? 10
      : Math.max(Number(offset), 1);
    const skip = (pageNum - 1) * limit;

    let ratingFilter = parseInt(req.query.rating as string, 10);
    if (isNaN(ratingFilter) || ratingFilter < 1 || ratingFilter > 5) {
      ratingFilter = 0;
    }

    const matchStage: any = {
      motorcycleId: new mongoose.Types.ObjectId(motorcycleId),
    };

    if (ratingFilter > 0) {
      matchStage.rating = { $gte: ratingFilter };
    }

    const reviews = await Review.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [{ $project: { username: 1, fullname: 1 } }],
          as: "customer",
        },
      },
      {
        $addFields: {
          customer: { $arrayElemAt: ["$customer", 0] },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }, { $addFields: { page: pageNum } }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]);

    return res
      .status(200)
      .json(
        new ApiResponse(200, true, "Reviews Fetched Successfully", reviews[0]),
      );
  },
);

const addNewReviewToBookingId = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { bookingId } = req.params;

    if (!isValidObjectId(bookingId)) {
      throw new ApiError(400, "Invalid Motorcycle ID");
    }

    const booking = await Booking.findOne({
      _id: bookingId,
      customerId: req.user._id,
      status: BookingStatusEnum.COMPLETED,
    });

    if (!booking) {
      throw new ApiError(404, "Your Booking doesn't exist or Incomplete");
    }

    const existingReview = await Review.findOne({
      bookingId,
      userId: req.user._id?.toString(),
    });

    if (existingReview) {
      throw new ApiError(400, "You have already reviewed this Booking");
    }

    const review = await Review.create({
      bookingId,
      userId: req.user._id,
      rating: req.body.rating,
      comment: req.body.comment,
    });

    if (!review) {
      throw new ApiError(500, "Failed to add review");
    }

    return res.status(201).json(
      new ApiResponse(201, true, "Review Added Successfully", {
        ...review,
        customer: {
          fullname: req.user.fullname,
          username: req.user.username,
        },
      }),
    );
  },
);

const updateReviewById = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { reviewId } = req.params;

    if (!isValidObjectId(reviewId)) {
      throw new ApiError(400, "Invalid Review ID");
    }

    const review = await Review.findOne({
      _id: reviewId,
      userId: req.user._id?.toString(),
    });

    if (!review) {
      throw new ApiError(404, "Your Review doesn't exist");
    }

    let data: { [key: string]: any } = {};

    ["rating", "comment"].forEach((key) => {
      if (req.body[key]) {
        data[key] = req.body[key];
      }
    });

    const updatedReview = await Review.findOneAndUpdate(
      { _id: reviewId, userId: req.user._id?.toString() },
      { $set: data },
      { new: true },
    );

    if (!updatedReview) {
      throw new ApiError(500, "Error updating review");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Review Updated Successfully",
          updatedReview,
        ),
      );
  },
);

const deleteReviewById = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { reviewId } = req.params;

    if (!isValidObjectId(reviewId)) {
      throw new ApiError(400, "Invalid Review ID");
    }

    const review = await Review.findOne({ _id: reviewId });

    if (
      req.user.role === UserRolesEnum.CUSTOMER &&
      review?.userId?.toString() !== req.user._id?.toString()
    ) {
      throw new ApiError(403, "Unauthorized action");
    }

    await Review.findOneAndDelete({ _id: reviewId });

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Review Deleted Successfully"));
  },
);

export {
  getAllReviewsOfMotorcycleById,
  addNewReviewToBookingId,
  updateReviewById,
  deleteReviewById,
};
