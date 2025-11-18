import { Request, Response } from "express";
import crypto, { BinaryLike } from "crypto";
import jwt from "jsonwebtoken";
import asyncHandler from "../utils/async-handler";
import { CustomRequest, IUser, User } from "../models/users.model";
import { ApiError } from "../utils/api-error";
import { ApiResponse } from "../utils/api-response";
import {
  AvailableUserRoles,
  UserAuthType,
  UserRolesEnum,
} from "../constants/constants";
import { NODE_ENV, REFRESH_TOKEN_SECRET } from "../utils/env";
import {
  emailVerificationTemplate,
  resetPasswordTemplate,
  sendEmail,
} from "../utils/mail";
import { deleteFile, uploadFile } from "../utils/cloudinary";

async function generateAccessAndRefreshTokens(user: IUser) {
  try {
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Failed to generate tokens");
  }
}

const userRegister = asyncHandler(async (req: Request, res: Response) => {
  const { fullname, email, username, password } = req.body;
  const existedUser = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  const user = await User.create({
    fullname,
    email,
    username,
    password,
    loginType: UserAuthType.CREDENTIALS,
  });

  const { unHashedToken, hashedToken, tokenExpiry } =
    user.generateTemporaryToken();

  user.emailVerificationToken = hashedToken;
  user.emailVerificationExpiry = tokenExpiry;
  await user.save({ validateBeforeSave: false });
  sendEmail({
    email,
    subject: "Email Verification",
    template: emailVerificationTemplate({
      username: user.username,
      emailVerificationToken: unHashedToken,
    }),
  });

  const createdUser = await User.findOne({ _id: user._id }).select(
    "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        true,
        "Account Registration Successful !! Please verify your email.",
        createdUser,
      ),
    );
});

const userLogin = asyncHandler(async (req: Request, res: Response) => {
  const { user, password } = req.body;

  const existedUser = await User.findOne<IUser>({
    $or: [{ username: user }, { email: user }],
  });

  if (!existedUser) {
    throw new ApiError(401, "Account doesn't exist");
  }

  const isPasswordCorrect = await existedUser.isPasswordCorrect(password);
  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid Credentials");
  }

  if (existedUser.loginType !== UserAuthType.CREDENTIALS) {
    throw new ApiError(
      400,
      "You have previously registered using " +
        existedUser.loginType?.toLowerCase() +
        ". Please use the " +
        existedUser.loginType?.toLowerCase() +
        " login option to access your account.",
    );
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshTokens(existedUser);

  const currUser = await User.findOne({ _id: existedUser._id }).select(
    "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
  );

  const options = {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "none" as const,
    path: "/",  // Ensure cookies are sent for all paths
  };

  const accessTokenOptions = { ...options, maxAge: 24 * 60 * 60 * 1000 };
  const refreshTokenOptions = { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 };

  // Check if request is likely from a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    req.headers['user-agent'] || ''
  );
  
  // Check if request is from the production domain
  const isTorqRidesDomain = 
    req.headers.origin?.includes('torqrides.com') || 
    req.get('host')?.includes('torqrides.com');
    
  // For mobile compatibility, ALWAYS include tokens in the response body
  const responseData = {
    ...currUser?.toObject() || {},
    // Always include tokens for mobile clients
    accessToken: accessToken,
    refreshToken: refreshToken,
  };
  
  console.log(`Login successful - User agent: ${req.headers['user-agent'] || 'unknown'}`);
  console.log(`Detected as mobile: ${isMobile}, Production domain: ${isTorqRidesDomain}`);
  console.log(`Returning tokens in response body: accessToken=${!!accessToken}, refreshToken=${!!refreshToken}`);

  return res
    .status(200)
    .cookie("accessToken", accessToken, accessTokenOptions)
    .cookie("refreshToken", refreshToken, refreshTokenOptions)
    .json(new ApiResponse(200, true, "Login Successful !!", responseData));
});

const userLogout = asyncHandler(async (req: CustomRequest, res: Response) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: "",
      },
    },
    { new: true },
  );

  const options = {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "none" as const,
    path: "/",  // Ensure cookies are sent for all paths
  };

  const accessTokenOptions = { ...options, maxAge: 24 * 60 * 60 * 1000 };
  const refreshTokenOptions = { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 };

  return res
    .status(200)
    .clearCookie("accessToken", accessTokenOptions)
    .clearCookie("refreshToken", refreshTokenOptions)
    .json(new ApiResponse(200, true, "Logout Successful"));
});

const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!token?.trim()) {
    throw new ApiError(400, "Email verification token is missing");
  }

  let hashedToken = crypto.createHash("sha512").update(token).digest("hex");

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpiry: { $gt: Date.now() },
  });

  if (!user) {
    throw new ApiError(404, "Invalid Token or Verification time is expired");
  }

  if (user.isEmailVerified) {
    throw new ApiError(489, "Email is already verified!");
  }

  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  user.isEmailVerified = true;

  await user.save({ validateBeforeSave: false });

  return res.status(200).json(
    new ApiResponse(200, true, "Email is verified", {
      isEmailVerified: true,
    }),
  );
});

const resendVerificationEmail = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const user = await User.findOne({
      _id: req.user._id,
      isEmailVerified: false,
    });

    if (!user) {
      throw new ApiError(404, "Account does not exists", []);
    }

    if (user.isEmailVerified) {
      throw new ApiError(489, "Email is already verified!");
    }

    const { unHashedToken, hashedToken, tokenExpiry } =
      user.generateTemporaryToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpiry = tokenExpiry;
    await user.save({ validateBeforeSave: false });
    try {
      console.log("Attempting to resend verification email to:", user.email);
      await sendEmail({
        email: user.email,
        subject: "Email Verification",
        template: emailVerificationTemplate({
          username: user.username,
          emailVerificationToken: unHashedToken,
        }),
      });
      console.log("Verification email sent successfully to:", user.email);
    } catch (error) {
      console.error("Failed to send verification email:", error);
      // We'll continue and return success to the client even if email fails
      // This is so the UI doesn't show an error, but we'll have the error logged
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Verification Mail has been sent to your registred email-ID",
        ),
      );
  },
);

const refreshAccessToken = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      throw new ApiError(401, "Session Expired !! Please login again");
    }

    const decodedToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET!) as {
      _id: string;
    };

    if (!decodedToken) {
      throw new ApiError(401, "Unauthorized");
    }

    const user = await User.findOne({
      _id: decodedToken._id,
      refreshToken,
    });

    if (!user) {
      throw new ApiError(401, "Session Expired !! Please login again");
    }

    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user);

    const options = {
      httpOnly: true,
      secure: NODE_ENV === "production",
      sameSite: "none" as const,
    };

    const accessTokenOptions = { ...options, maxAge: 1 * 24 * 60 * 60 * 1000 };
    const refreshTokenOptions = { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 };

    // Check if request is likely from a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      req.headers['user-agent'] || ''
    );
    
    // Check if request is from the production domain
    const isTorqRidesDomain = 
      req.headers.origin?.includes('torqrides.com') || 
      req.get('host')?.includes('torqrides.com');
    
    // Always include tokens in response for mobile compatibility
    const responseData = {
      // Always include tokens for mobile clients
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
    
    console.log(`Token refresh - User agent: ${req.headers['user-agent'] || 'unknown'}`);
    console.log(`Detected as mobile: ${isMobile}, Production domain: ${isTorqRidesDomain}`);
    console.log(`Returning tokens in response: accessToken=${!!newAccessToken}, refreshToken=${!!newRefreshToken}`);
    
    return res
      .status(200)
      .cookie("accessToken", newAccessToken, accessTokenOptions)
      .cookie("refreshToken", newRefreshToken, refreshTokenOptions)
      .json(new ApiResponse(200, true, "Access token refreshed", responseData));
  },
);

const forgotPasswordRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const { user } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email: user }, { username: user }],
    });

    if (!existingUser) {
      throw new ApiError(404, "Account doesn't exists");
    }

    const { unHashedToken, hashedToken, tokenExpiry } =
      existingUser.generateTemporaryToken();

    existingUser.forgotPasswordToken = hashedToken;
    existingUser.forgotPasswordExpiry = tokenExpiry;
    await existingUser.save({ validateBeforeSave: false });

    sendEmail({
      email: existingUser.email,
      subject: "Password Reset",
      template: resetPasswordTemplate({
        username: existingUser.username,
        resetPasswordToken: unHashedToken,
      }),
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Reset Password Link has been sent to your registred Email-ID",
        ),
      );
  },
);

const resetForgottenPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token) {
      throw new ApiError(404, "Invalid Link");
    }

    const { newPassword } = req.body;

    const hashedToken = crypto
      .createHash("sha512")
      .update(token as BinaryLike)
      .digest("hex");
    const user = await User.findOne({
      forgotPasswordToken: hashedToken,
      forgotPasswordExpiry: { $gt: Date.now() },
    });

    if (!user) {
      throw new ApiError(
        404,
        "Invalid Token or Password Verification time is expired",
      );
    }

    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    user.password = newPassword;

    await user.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Password reset successfully"));
  },
);

const changeCurrentPassword = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    if (oldPassword === newPassword) {
      throw new ApiError(
        400,
        "New password can't be same as Old password. Try Something New!",
      );
    }

    if (newPassword !== confirmNewPassword) {
      throw new ApiError(400, "Passwords do not match");
    }

    const exisitingUser = await User.findById(req.user._id);
    if (!exisitingUser) {
      throw new ApiError(401, "Invalid Account");
    }
    const isPasswordCorrect =
      await exisitingUser.isPasswordCorrect(oldPassword);
    if (!isPasswordCorrect) {
      throw new ApiError(401, "Wrong Password");
    }

    exisitingUser.password = newPassword;
    await exisitingUser.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Password changed successfully"));
  },
);

const assignRole = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { role } = req.body;

  if (!AvailableUserRoles.includes(role)) {
    throw new ApiError(400, "Invalid Role");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }
  user.role = role;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, true, "Role assigned successfully!!"));
});

const getCurrentUser = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const user = await User.findById(req.user._id).select(
      "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
    );
    if (!user) {
      throw new ApiError(404, "User does not exist");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Account fetched successfully", user));
  },
);

const changeAvatar = asyncHandler(async (req: CustomRequest, res: Response) => {
  if (!req.file || !req.file.path) {
    throw new ApiError(400, "Profile Image is required !!");
  }

  const avatarPath = req.file?.path || "";
  const avatar = await uploadFile(avatarPath);

  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        avatar: {
          public_id: avatar?.public_id,
          url: avatar?.url,
          format: avatar?.format,
          resource_type: avatar?.resource_type,
        },
      },
    },
    { new: true },
  ).select(
    "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
  );

  const { old_avatar_public_id } = req.body;
  if (old_avatar_public_id)
    await deleteFile(old_avatar_public_id, avatar?.resource_type);

  return res
    .status(200)
    .json(
      new ApiResponse(200, true, "Avatar updated successfully", updatedUser),
    );
});

const deleteUserAccount = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { userId } = req.params;

    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User does not exist");
    }

    const { avatar, documents } = user;
    if (avatar?.public_id) {
      await deleteFile(avatar.public_id, avatar.resource_type);
    }

    if (documents) {
      for (const document of documents) {
        await deleteFile(document.file.public_id, document.file.resource_type);
      }
    }

    await User.findByIdAndDelete(userId);

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Account deleted successfully"));
  },
);

const uploadUserDocument = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    if (!req.file || !req.file.path) {
      throw new ApiError(400, "Document is required !!");
    }

    const { type, name } = req.body;

    const existingDocument = await User.findOne({
      _id: req.user._id,
      "documents.type": type,
    });

    if (existingDocument) {
      throw new ApiError(400, `${type} Document already exists`);
    }

    const documentPath = req.file?.path || "";
    if (!documentPath) {
      throw new ApiError(400, "Document is required !!");
    }
    const document = await uploadFile(documentPath);

    if (!type?.trim()) {
      throw new ApiError(400, "Document type and name is required !!");
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: {
          documents: {
            type,
            name,
            file: {
              public_id: document.public_id,
              url: document.url,
              format: document.format,
              resource_type: document.resource_type,
            },
          },
        },
      },
      { new: true },
    ).select(
      "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Document uploaded successfully",
          updatedUser,
        ),
      );
  },
);

const deleteUserDocument = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { documentId } = req.params;

    const existingUser = await User.findOne({
      "documents._id": documentId,
    });

    if (!existingUser) {
      throw new ApiError(404, "Document not found !!");
    }

    if (
      req.user.role === UserRolesEnum.CUSTOMER &&
      existingUser?._id?.toString() !== req.user._id?.toString()
    ) {
      throw new ApiError(403, "Unauthorized action");
    }

    const document = existingUser.documents.find(
      (doc) => doc._id?.toString() === documentId,
    );

    if (!document) {
      throw new ApiError(404, "Document does not exist");
    }

    await deleteFile(document.file.public_id, document.file.resource_type);

    await User.findByIdAndUpdate(
      existingUser._id,
      {
        $pull: {
          documents: {
            _id: documentId,
          },
        },
      },
      { new: true },
    ).select(
      "-password -refreshToken -emailVerificationToken -emailVerificationExpiry -forgotPasswordToken -forgotPasswordExpiry",
    );

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Document deleted successfully"));
  },
);

const getAllUsers = asyncHandler(async (req: CustomRequest, res: Response) => {
  const { page, offset, searchTerm, role, verification } = req.query;

  let matchState: Record<string, any> = {};
  const data = searchTerm?.toString().toLocaleLowerCase().trim();

  if (data) {
    matchState.$or = [
      { fullname: { $regex: data, $options: "i" } },
      { email: { $regex: data, $options: "i" } },
      { phone: { $regex: data, $options: "i" } },
      { username: { $regex: data, $options: "i" } },
    ];
  }

  if (role) matchState.role = role;
  if (verification)
    matchState.isEmailVerified = verification === "true" ? true : false;

  const pageNum = Number.isNaN(Number(page)) ? 1 : Math.max(Number(page), 1);
  const limit = Number.isNaN(Number(offset)) ? 10 : Math.max(Number(offset), 1);
  const skip = (pageNum - 1) * Math.min(limit, 12);

  const users = await User.aggregate([
    {
      $match: matchState,
    },
    {
      $sort: { updatedAt: -1 },
    },
    {
      $project: {
        _id: 1,
        fullname: 1,
        username: 1,
        phone: 1,
        email: 1,
        role: 1,
        address: 1,
        isEmailVerified: 1,
        avatar: 1,
        documents: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      $facet: {
        metadata: [{ $count: "total" }, { $addFields: { page: pageNum } }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, true, "Users fetched", users[0]));
});

const updateUserProfile = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { fullname, email, username, address, phone } = req.body;

    let data: Record<string, any> = {};

    if (address?.trim()) data.address = address.trim();
    if (phone?.trim()) data.phone = phone.trim();

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        fullname,
        email,
        username,
        ...data,
      },
      { new: true },
    );

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Profile updated successfully", user));
  },
);

export {
  userRegister,
  userLogin,
  userLogout,
  verifyEmail,
  resendVerificationEmail,
  refreshAccessToken,
  forgotPasswordRequest,
  resetForgottenPassword,
  changeCurrentPassword,
  assignRole,
  getCurrentUser,
  changeAvatar,
  deleteUserAccount,
  uploadUserDocument,
  deleteUserDocument,
  getAllUsers,
  updateUserProfile,
};
