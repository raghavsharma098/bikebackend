import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  ACCESS_TOKEN_SECRET,
  REFRESH_TOKEN_SECRET,
} from "../utils/env";
import {
  AvailableAuthTypes,
  AvailableUserRoles,
  UserAuthType,
  UserRolesEnum,
} from "../constants/constants";
import { File } from "./motorcycles.model";
import { Cart } from "./carts.model";

export const DocumentTypesEnum = {
  E_KYC: "E-KYC",
  PAN_CARD: "PAN-CARD",
  AADHAR_CARD: "AADHAR-CARD",
  DRIVING_LICENSE: "DRIVING-LICENSE",
} as const;

export const AvailableDocumentTypes = Object.values(DocumentTypesEnum);

export type DocumentTypes = (typeof AvailableDocumentTypes)[number];

export interface IDocument extends mongoose.Document {
  type: DocumentTypes;
  name: string;
  file: File;
}

export interface IUser extends mongoose.Document {
  fullname: string;
  email: string;
  username: string;
  phone: string;
  address: string;
  password: string;
  loginType: string;
  avatar: File;
  role: AvailableUserRoles;
  isEmailVerified: boolean;
  emailVerificationToken: string | undefined;
  emailVerificationExpiry: Date | undefined;
  forgotPasswordToken: string | undefined;
  forgotPasswordExpiry: Date | undefined;
  refreshToken: string;
  documents: IDocument[];

  isPasswordCorrect(password: string): boolean;
  generateAccessToken(): string;
  generateRefreshToken(): string;
  generateTemporaryToken(): {
    unHashedToken: string;
    hashedToken: string;
    tokenExpiry: Date;
  };
}

export interface CustomRequest extends Request {
  user: IUser;
}

const userSchema = new mongoose.Schema<IUser>(
  {
    fullname: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    phone: {
      type: String,
      unique: true,
    },
    address: {
      type: String,
    },
    password: {
      type: String,
    },
    role: {
      type: String,
      enum: AvailableUserRoles,
      default: UserRolesEnum.CUSTOMER,
      required: true,
    },
    avatar: {
      type: {
        url: String,
        format: String,
        resource_type: String,
        public_id: String,
      },
    },
    loginType: {
      type: String,
      enum: AvailableAuthTypes,
      default: UserAuthType.CREDENTIALS,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpiry: {
      type: Date,
    },
    refreshToken: {
      type: String,
    },
    forgotPasswordToken: {
      type: String,
    },
    forgotPasswordExpiry: {
      type: Date,
    },
    documents: [
      {
        type: {
          type: String,
          enum: AvailableDocumentTypes,
          required: true,
        },
        name: {
          type: String,
        },
        file: {
          url: String,
          format: String,
          resource_type: String,
          public_id: String,
        },
      },
    ],
  },
  { timestamps: true },
);

userSchema.pre("save", async function (this: IUser, next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.post("save", async function (this: IUser) {
  if (this.isNew) {
    try {
      await Cart.create({ customerId: this._id, items: [] });
    } catch (error) {
      console.error(`Failed to create cart for new user ${this._id}:`, error);
    }
  }
});

userSchema.methods.isPasswordCorrect = async function (password: string) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      role: this.role,
    },
    ACCESS_TOKEN_SECRET!,
    { expiresIn: "1D" },
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ _id: this._id }, REFRESH_TOKEN_SECRET!, {
    expiresIn: "7D",
  });
};

userSchema.methods.generateTemporaryToken = function () {
  const unHashedToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha512")
    .update(unHashedToken)
    .digest("hex");
  const tokenExpiry = Date.now() + 15 * 60 * 1000;

  return { unHashedToken, hashedToken, tokenExpiry: new Date(tokenExpiry) };
};

export const User = mongoose.model<IUser>("User", userSchema);
