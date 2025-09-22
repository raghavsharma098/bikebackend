import asyncHandler from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";
import { ApiError } from "../utils/api-error";
import { CustomRequest } from "../models/users.model";
import { Response } from "express";
import { MotorcycleLog } from "../models/motorcycle-logs.model";
import mongoose, { isValidObjectId } from "mongoose";

const createMotorcycleLog = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { motorcycleId } = req.params;
    if (!isValidObjectId(motorcycleId)) {
      throw new ApiError(404, "Motorcycle not found");
    }
    const log = await MotorcycleLog.create({
      ...req.body,
      motorcycleId,
    });
    return res
      .status(201)
      .json(new ApiResponse(201, true, "Log created successfully", log));
  },
);

const getAllMotorcycleLogs = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const matchState: Record<string, any> = {};

    const {
      make,
      vehicleModel,
      searchTerm,
      registrationNumber,
      serviceCentre,
      dateIn,
      dateOut,
      page,
      offset,
      categories,
      cities,
      status,
    } = req.query;

    // Correctly query top-level fields
    if (serviceCentre) matchState.serviceCentreName = serviceCentre;
    if (dateIn) matchState.dateIn = dateIn;
    if (dateOut) matchState.dateOut = dateOut;
    if (status) matchState.status = status;

    // Correctly query nested fields using dot notation
    if (make) matchState["motorcycle.make"] = make;
    if (vehicleModel) matchState["motorcycle.vehicleModel"] = vehicleModel;
    if (registrationNumber)
      matchState["motorcycle.registrationNumber"] = registrationNumber; // Corrected path

    if (categories) {
      matchState["motorcycle.categories"] = {
        $in: categories?.toString().split(","),
      };
    }

    if (cities) {
      matchState["motorcycle.availableInCities.branch"] = {
        $in: cities?.toString().split("$"),
      };
    }

    // Correctly structure the $or operator for searchTerm
    if (searchTerm?.toString().trim()) {
      const searchRegex = {
        $regex: searchTerm.toString().trim(),
        $options: "i",
      };
      matchState.$or = [
        { serviceCentreName: searchRegex },
        { registrationNumber: searchRegex },
        { "motorcycle.make": searchRegex },
        { "motorcycle.vehicleModel": searchRegex },
        { "motorcycle.description": searchRegex },
      ];
    }

    const pageNum = Number.isNaN(Number(page)) ? 1 : Math.max(Number(page), 1);
    const limit = Number.isNaN(Number(offset))
      ? 10
      : Math.max(Number(offset), 1);
    const skip = (pageNum - 1) * limit; // Simplified skip calculation

    const logs = await MotorcycleLog.aggregate([
      {
        $lookup: {
          from: "motorcycles",
          localField: "motorcycleId",
          foreignField: "_id",
          as: "motorcycle",
        },
      },
      {
        $addFields: {
          motorcycle: { $arrayElemAt: ["$motorcycle", 0] },
        },
      },
      {
        $match: matchState, // This will now work correctly
      },
      {
        $sort: { updatedAt: -1 },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }, { $addFields: { page: pageNum } }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]);

    return res.json(
      new ApiResponse(200, true, "Logs fetched successfully", logs[0]),
    );
  },
);

const getMotorcycleLogs = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { motorcycleId } = req.params;

    const { page, offset } = req.query;

    const pageNum = Number.isNaN(Number(page)) ? 1 : Math.max(Number(page), 1);
    const limit = Number.isNaN(Number(offset))
      ? 10
      : Math.max(Number(offset), 1);
    const skip = (pageNum - 1) * limit; // Simplified skip calculation

    const logs = await MotorcycleLog.aggregate([
      {
        $match: {
          motorcycleId: new mongoose.Types.ObjectId(motorcycleId),
        },
      },
      {
        $lookup: {
          from: "motorcycles",
          localField: "motorcycleId",
          foreignField: "_id",
          as: "motorcycle",
        },
      },
      {
        $addFields: {
          motorcycle: { $arrayElemAt: ["$motorcycle", 0] },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }, { $addFields: { page: pageNum } }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]);

    return res.json(
      new ApiResponse(200, true, "Log fetched successfully", logs[0]),
    );
  },
);

const updateMotorcycleLog = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { logId } = req.params;
    const updated = await MotorcycleLog.findOneAndUpdate(
      { _id: logId },
      req.body,
      { new: true },
    );
    if (!updated) {
      throw new ApiError(404, "Log not found");
    }

    const updatedLog = await MotorcycleLog.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(logId),
        },
      },
      {
        $lookup: {
          from: "motorcycles",
          localField: "motorcycleId",
          foreignField: "_id",
          as: "motorcycle",
        },
      },
      {
        $addFields: {
          motorcycle: { $arrayElemAt: ["$motorcycle", 0] },
        },
      },
    ]);

    return res.json(
      new ApiResponse(200, true, "Log updated successfully", updatedLog[0]),
    );
  },
);

const deleteMotorcycleLog = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const { logId } = req.params;
    const deleted = await MotorcycleLog.findOneAndDelete(
      { _id: logId },
      { isDeleted: true },
    );
    if (!deleted)
      return res.status(404).json(new ApiResponse(404, false, "Log not found"));
    return res.json(new ApiResponse(200, true, "Log deleted successfully"));
  },
);

const getMotorcycleLogFilters = asyncHandler(
  async (req: CustomRequest, res: Response) => {
    const [result] = await MotorcycleLog.aggregate([
      {
        $facet: {
          statuses: [
            { $group: { _id: null, statuses: { $addToSet: "$status" } } },
            { $project: { _id: 0, statuses: 1 } },
          ],
          serviceCentres: [
            {
              $group: {
                _id: null,
                serviceCentres: { $addToSet: "$serviceCentreName" },
              },
            },
            { $project: { _id: 0, serviceCentres: 1 } },
          ],
        },
      },
    ]);

    const branches = result.branches?.[0]?.branches ?? [];
    const statuses = result.statuses?.[0]?.statuses ?? [];
    const serviceCentres = result.serviceCentres?.[0]?.serviceCentres ?? [];

    return res.status(200).json(
      new ApiResponse(200, true, "Filters fetched successfully", {
        branches,
        statuses,
        serviceCentres,
      }),
    );
  },
);

export {
  createMotorcycleLog,
  getAllMotorcycleLogs,
  getMotorcycleLogs,
  updateMotorcycleLog,
  deleteMotorcycleLog,
  getMotorcycleLogFilters,
};
