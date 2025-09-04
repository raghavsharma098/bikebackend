import mongoose from "mongoose";
import {
  AvailablePromoCodeTypes,
  PromoCodeTypeEnum,
} from "../constants/constants";

export interface IPromoCode extends mongoose.Document {
  name: string;
  promoCode: string;
  type: string;
  discountValue: number;
  isActive: boolean;
  minimumCartValue: number;
  startDate: Date;
  expiryDate: Date;
  owner: mongoose.Types.ObjectId;
}

export const promoCodeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    promoCode: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: AvailablePromoCodeTypes,
      default: PromoCodeTypeEnum.FLAT,
    },
    discountValue: {
      type: Number,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    minimumCartValue: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

export const PromoCode = mongoose.model("PromoCode", promoCodeSchema);
