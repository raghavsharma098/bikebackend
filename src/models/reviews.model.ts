import mongoose from "mongoose";

export interface IReview extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  bookingId: mongoose.Types.ObjectId;
  motorcycleId: mongoose.Types.ObjectId;
  rating: number;
  comment: string;
}

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    motorcycleId : {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Motorcycle",
    },
    rating: {
      type: Number,
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
  },
  { timestamps: true },
);

export const Review = mongoose.model("Review", reviewSchema);
