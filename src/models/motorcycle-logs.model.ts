import mongoose from "mongoose";
import {
  MotorcycleStatusEnum,
  Motorcycle,
  MotorcycleStatus,
  File,
  AvailableInCities,
} from "./motorcycles.model";

export interface IMotorcycleLog extends mongoose.Document {
  motorcycleId: mongoose.Types.ObjectId;
  registrationNumber: string;
  branch: AvailableInCities;
  dateIn: Date;
  serviceCentreName: string;
  thingsToDo: {
    scheduledService: boolean;
    odoReading: number;
    brakePads: boolean;
    chainSet: boolean;
    damageRepair: boolean;
    damageDetails?: string;
    clutchWork: boolean;
    clutchDetails?: string;
    other: boolean;
    otherDetails?: string;
  };
  status: MotorcycleStatus;
  dateOut?: Date;
  billAmount?: number;
  billCopy?: File;
  isAvailable: boolean;
}

const motorcycleLogSchema = new mongoose.Schema<IMotorcycleLog>(
  {
    motorcycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: Motorcycle.modelName,
      required: true,
    },

    registrationNumber: {
      type: String,
      required: true,
      trim: true,
    },

    branch: {
      type: String,
      enum: AvailableInCities,
      required: true,
    },

    dateIn: {
      type: Date,
    },

    serviceCentreName: {
      type: String,
      required: true,
      trim: true,
    },

    thingsToDo: {
      scheduledService: { type: Boolean, default: false },
      odoReading: { type: Number, required: true },
      brakePads: { type: Boolean, default: false },
      chainSet: { type: Boolean, default: false },
      damageRepair: { type: Boolean, default: false },
      damageDetails: { type: String, trim: true },
      clutchWork: { type: Boolean, default: false },
      clutchDetails: { type: String, trim: true },
      other: { type: Boolean, default: false },
      otherDetails: { type: String, trim: true },
    },

    status: {
      type: String,
      enum: Object.values(MotorcycleStatusEnum),
      default: MotorcycleStatusEnum.OK,
    },

    dateOut: {
      type: Date,
    },

    billAmount: {
      type: Number,
      default: 0,
    },

    billCopy: {
      public_id: { type: String, required: false },
      url: { type: String, required: false },
      resource_type: { type: String, required: false },
      format: { type: String, required: false },
    },

    isAvailable: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

motorcycleLogSchema.post("save", async function (doc) {
  // once dateOut is set and isAvailable === true, free up the bike
  if (doc.dateOut && doc.isAvailable) {
    await Motorcycle.findByIdAndUpdate(doc.motorcycleId, {
      isAvailable: true,
      status: MotorcycleStatusEnum.OK,
    });
  } else if (!doc.dateOut) {
    // while in service, block it
    await Motorcycle.findByIdAndUpdate(doc.motorcycleId, {
      isAvailable: false,
      status: MotorcycleStatusEnum.IN_SERVICE,
    });
  }
});

export const MotorcycleLog = mongoose.model<IMotorcycleLog>(
  "MotorcycleLog",
  motorcycleLogSchema,
);
