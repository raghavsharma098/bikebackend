import mongoose from "mongoose";

export const MotorcycleStatusEnum = {
  OK: "OK",
  DUE: "DUE-SERVICE",
  IN_SERVICE: "IN-SERVICE",
  IN_REPAIR: "IN-REPAIR",
} as const;

export const MotorcycleCategoryEnum = {
  TOURING: "TOURING",
  CRUISER: "CRUISER",
  ADVENTURE: "ADVENTURE",
  SCOOTER: "SCOOTER",
  SUPERBIKE: "SUPERBIKE",
  ELECTRIC: "ELECTRIC",
  OTHER: "OTHER",
} as const;

export const AvailableInCitiesEnum = {
  JANAKPURI: "Janak Puri, Delhi",
  MGROAD: "MG Road, Gurgaon",
} as const;

export const AvailableMotorcycleStatus = Object.values(MotorcycleStatusEnum);
export const AvailableMotorcycleCategories = Object.values(
  MotorcycleCategoryEnum,
);
export const AvailableInCities = Object.values(AvailableInCitiesEnum);

export type MotorcycleStatus = (typeof AvailableMotorcycleStatus)[number];
export type MotorcycleCategory = (typeof AvailableMotorcycleCategories)[number];
export type AvailableInCities = (typeof AvailableInCities)[number];

export interface File {
  public_id: string;
  url: string;
  resource_type: string;
  format: string;
}

export interface IMotorcycle extends mongoose.Document {
  make: string;
  vehicleModel: string;
  description: string;
  categories: MotorcycleCategory[];
  availableInCities: { branch: AvailableInCities; quantity: number }[];
  specs: {
    engine: number;
    power: number;
    weight: number;
    seatHeight: number;
  };

  pricePerDayMonThu: number;
  pricePerDayFriSun: number;
  pricePerWeek: number;
  variant: string;
  color: string;
  securityDeposit: number;
  kmsLimitPerDay: number;
  extraKmsCharges: number;
  images: File[];
  rating: number;
}

const motorcycleSchema = new mongoose.Schema<IMotorcycle>(
  {
    make: {
      type: String,
      required: true,
    },
    vehicleModel: {
      type: String,
      required: true,
    },
    pricePerDayMonThu: {
      type: Number,
      required: true,
    },
    pricePerDayFriSun: {
      type: Number,
      required: true,
    },
    pricePerWeek: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    categories: [
      {
        type: String,
        enum: AvailableMotorcycleCategories,
        required: true,
      },
    ],
    specs: {
      engine: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      power: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      weight: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
      seatHeight: {
        type: Number,
        required: true,
        min: 0,
        default: 0,
      },
    },
    availableInCities: [
      {
        branch: {
          type: String,
          enum: AvailableInCities,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
      },
    ],
    variant: {
      type: String,
      required: true,
    },
    color: {
      type: String,
      required: true,
    },
    securityDeposit: {
      type: Number,
      required: true,
    },
    kmsLimitPerDay: {
      type: Number,
      required: true,
    },
    extraKmsCharges: {
      type: Number,
      required: true,
    },
    images: [
      {
        public_id: {
          type: String,
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        resource_type: {
          type: String,
          required: true,
        },
        format: {
          type: String,
          required: true,
        },
      },
    ],
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
  },
  { timestamps: true },
);

export const Motorcycle = mongoose.model<IMotorcycle>(
  "Motorcycle",
  motorcycleSchema,
);
