import asyncHandler from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";
import { ApiError } from "../utils/api-error";
import { CustomRequest } from "../models/users.model";
import { NextFunction, Response } from "express";
import mongoose from "mongoose";
import { Motorcycle } from "../models/motorcycles.model";
import { deleteFile, uploadFile } from "../utils/cloudinary";
import { UserRolesEnum } from "../constants/constants";
import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SECRET } from "../utils/env";

const getAllMotorcycles = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const matchState: Record<string, any> = {};
    const {
      make,
      vehicleModel,
      searchTerm,
      minPrice,
      maxPrice,
      page,
      offset,
      categories,
      cities,
      sort,
    } = req.query;

    if (make) matchState.make = make;
    if (vehicleModel) matchState.vehicleModel = vehicleModel;

    if (categories)
      matchState.categories = {
        $in: categories?.toString().split(","),
      };

    if (minPrice && maxPrice)
      matchState.pricePerDayMonThu = {
        $gte: Number(minPrice),
        $lte: Number(maxPrice),
      };

    if (minPrice || maxPrice) {
      matchState.pricePerDayMonThu = {};
      if (minPrice) matchState.pricePerDayMonThu.$gte = Number(minPrice);
      if (maxPrice) matchState.pricePerDayMonThu.$lte = Number(maxPrice);
    }

    const availableInCities = cities?.toString().split("$");
    if (availableInCities?.length) {
      matchState["availableInCities.branch"] = { $in: availableInCities };
    }

    const token =
      req.cookies?.accessToken ||
      req.headers?.authorization?.replace("Bearer ", "");

    // Remove quantity filtering to show all bikes regardless of availability
    // This allows customers to see all bikes in the catalog
    if (token) {
      try {
        const decodedToken = jwt.verify(token, ACCESS_TOKEN_SECRET!) as {
          _id: string;
          role: string;
          email: string;
          username: string;
        };

        // Only admins see all bikes - customers now also see all bikes
        // No quantity filtering applied
      } catch (error) {
        console.error("JWT Verification Error:");
        // No quantity filtering applied for guests either
      }
    }
    // No quantity filtering - show all bikes to everyone

    if (searchTerm?.toString().trim()) {
      matchState.$or = [
        { make: { $regex: searchTerm, $options: "i" } },
        { vehicleModel: { $regex: searchTerm, $options: "i" } },
        { description: { $regex: searchTerm, $options: "i" } },
      ];
    }

    const pageNum = Number.isNaN(Number(page)) ? 1 : Math.max(Number(page), 1);
    const limit = Number.isNaN(Number(offset))
      ? 12
      : Math.max(Number(offset), 1);
    const skip = (pageNum - 1) * Math.min(limit, 12);

    const sortStage: Record<string, 1 | -1> =
      sort === "Newest"
        ? { createdAt: -1 }
        : sort === "LTH"
          ? { pricePerDayMonThu: 1 }
          : sort === "HTL"
            ? { pricePerDayMonThu: -1 }
            : sort === "Rating"
              ? { rating: -1 }
              : { updatedAt: -1 };

    const motorcycles = await Motorcycle.aggregate([
      {
        $match: matchState,
      },
      {
        $sort: sortStage,
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
      .json(
        new ApiResponse(
          200,
          true,
          "Motorcycles Fetched Successfully",
          motorcycles[0],
        ),
      );
  },
);

const addMotorcycle = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const {
      make,
      vehicleModel,
      pricePerDayMonThu,
      pricePerDayFriSun,
      pricePerWeek,
      description,
      categories,
      specs,
      availableInCities,
      variant,
      color,
      securityDeposit,
      kmsLimitPerDay,
      extraKmsCharges,
    } = req.body;

    const bike = await Motorcycle.findOne({
      make,
      vehicleModel,
      color,
      variant,
    });

    if (bike) {
      throw new ApiError(
        400,
        `Motorcycle of ${make} with ${vehicleModel} with color ${color} and variant ${variant} already exists !!`,
      );
    }

    const files = req.files as Express.Multer.File[];

    if (!files?.length) {
      throw new ApiError(400, "Please upload at least one image");
    }

    const images = await Promise.all(
      files.map(async (image) => {
        const img = await uploadFile(image.path);
        return {
          public_id: img.public_id,
          url: img.secure_url,
          resource_type: img.resource_type,
          format: img.format,
        };
      }),
    );

    const motorcycle = await Motorcycle.create({
      make,
      vehicleModel,
      pricePerDayMonThu: Number(pricePerDayMonThu),
      pricePerDayFriSun: Number(pricePerDayFriSun),
      pricePerWeek: Number(pricePerWeek),
      description,
      color,
      variant,
      categories,
      images,
      specs,
      extraKmsCharges: Number(extraKmsCharges),
      kmsLimitPerDay: Number(kmsLimitPerDay),
      securityDeposit: Number(securityDeposit),
      availableInCities,
    });

    if (!motorcycle) {
      throw new ApiError(400, "Motorcycle could not be created");
    }

    return res
      .status(201)
      .json(
        new ApiResponse(
          201,
          true,
          "Motorcycle Created Successfully",
          motorcycle,
        ),
      );
  },
);

const getMotorcycleById = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { motorcycleId } = req.params;

    const motorcycle = await Motorcycle.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(motorcycleId) } },
      {
        $lookup: {
          from: "bookings",
          localField: "_id",
          foreignField: "motorcycleId",
          as: "bookings",
          pipeline: [{ $project: { _id: 1 } }],
        },
      },
      {
        $lookup: {
          from: "reviews",
          let: { bookingIds: "$bookings._id" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$bookingId", "$$bookingIds"] },
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "_id",
                as: "user",
                pipeline: [{ $project: { username: 1, fullname: 1 } }],
              },
            },
            {
              $addFields: {
                user: { $arrayElemAt: ["$user", 0] },
              },
            },
            {
              $project: {
                rating: 1,
                comment: 1,
                user: 1,
                createdAt: 1,
              },
            },
          ],
          as: "reviews",
        },
      },
      {
        $project: {
          bookings: 0,
        },
      },
    ]);

    if (!motorcycle) {
      throw new ApiError(404, "Motorcycle not found");
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Motorcycle Fetched Successfully",
          motorcycle[0],
        ),
      );
  },
);

const updateMotorcycleDetails = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { motorcycleId } = req.params;

    const motorcycle = await Motorcycle.findById(motorcycleId);

    if (!motorcycle) {
      throw new ApiError(404, "Motorcycle not found");
    }

    const {
      make,
      vehicleModel,
      variant,
      color,
      categories,
      description,
      pricePerDayMonThu,
      pricePerDayFriSun,
      pricePerWeek,
      securityDeposit,
      kmsLimitPerDay,
      extraKmsCharges,
      specs,
      availableInCities,
    } = req.body;

    const files = req.files as Express.Multer.File[];

    let images: any[] = [];
    
    if (files && files.length > 0) {
      images = await Promise.all(
        files.map(async (image) => {
          const img = await uploadFile(image.path);
          return {
            public_id: img.public_id,
            url: img.secure_url,
            resource_type: img.resource_type,
            format: img.format,
          };
        }),
      );
    }

    motorcycle.make = make;
    motorcycle.vehicleModel = vehicleModel;
    motorcycle.variant = variant;
    motorcycle.color = color;
    motorcycle.categories = categories;
    motorcycle.description = description;
    motorcycle.pricePerDayMonThu = Number(pricePerDayMonThu);
    motorcycle.pricePerDayFriSun = Number(pricePerDayFriSun);
    motorcycle.pricePerWeek = Number(pricePerWeek);
    motorcycle.securityDeposit = Number(securityDeposit);
    motorcycle.kmsLimitPerDay = Number(kmsLimitPerDay);
    motorcycle.extraKmsCharges = Number(extraKmsCharges);
    motorcycle.specs = specs;
    motorcycle.availableInCities = availableInCities;
    
    if (images.length > 0) {
      motorcycle.images.push(
        ...images.map((img) => ({
          public_id: img.public_id,
          url: img.url,
          resource_type: img.resource_type,
          format: img.format,
        })),
      );
    }

    await motorcycle.save({ validateBeforeSave: false });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          true,
          "Motorcycle Updated Successfully",
          motorcycle,
        ),
      );
  },
);

const deleteMotorcycle = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { motorcycleId } = req.params;

    const motorcycle = await Motorcycle.findById(motorcycleId);

    if (!motorcycle) {
      throw new ApiError(404, "Motorcycle not found");
    }

    for (const image of motorcycle.images) {
      await deleteFile(image.public_id, image.resource_type);
    }

    await Motorcycle.findByIdAndDelete(motorcycleId);

    return res
      .status(200)
      .json(new ApiResponse(200, true, "Motorcycle Deleted Successfully"));
  },
);

const deleteMotorcycleImage = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { motorcycleId } = req.params;
    const { imageId } = req.body;
    const motorcycle = await Motorcycle.findById(motorcycleId);
    if (!motorcycle) {
      throw new ApiError(404, "Motorcycle not found");
    }
    const image = motorcycle.images.find(
      (image) => image.public_id === imageId,
    );
    if (!image) {
      throw new ApiError(404, "Image not found");
    }
    await deleteFile(image.public_id, image.resource_type);
    motorcycle.images = motorcycle.images.filter(
      (image) => image.public_id !== imageId,
    );
    await motorcycle.save({ validateBeforeSave: false });
    return res
      .status(200)
      .json(new ApiResponse(200, true, "Image deleted successfully"));
  },
);

const getAllFilters = asyncHandler(
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const [result] = await Motorcycle.aggregate([
      {
        $facet: {
          makes: [
            { $group: { _id: null, makes: { $addToSet: "$make" } } },
            { $project: { _id: 0, makes: 1 } },
          ],
          models: [
            { $group: { _id: null, models: { $addToSet: "$vehicleModel" } } },
            { $project: { _id: 0, models: 1 } },
          ],
          categories: [
            { $unwind: "$categories" },
            { $group: { _id: null, categories: { $addToSet: "$categories" } } },
            { $project: { _id: 0, categories: 1 } },
          ],
          cities: [
            { $unwind: "$availableInCities" },
            {
              $group: {
                _id: null,
                distinctCities: { $addToSet: "$availableInCities.branch" },
              },
            },
            { $project: { _id: 0, distinctCities: 1 } },
          ],
        },
      },
    ]);

    const makes = result.makes?.[0]?.makes ?? [];
    const models = result.models?.[0]?.models ?? [];
    const categories = result.categories?.[0]?.categories ?? [];
    const distinctCities = result.cities?.[0]?.distinctCities ?? [];

    return res.status(200).json(
      new ApiResponse(200, true, "Filters fetched successfully", {
        makes,
        models,
        categories,
        distinctCities,
      }),
    );
  },
);

export {
  getAllMotorcycles,
  getMotorcycleById,
  addMotorcycle,
  updateMotorcycleDetails,
  deleteMotorcycle,
  deleteMotorcycleImage,
  getAllFilters,
};
