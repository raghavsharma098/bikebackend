import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_FOLDER_NAME,
} from "./env";
import { ApiError } from "./api-error";

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const uploadFile = async (filePath: string) => {
  try {
    const response = await cloudinary.uploader.upload(filePath, {
      folder: CLOUDINARY_FOLDER_NAME,
      resource_type: "auto",
      background_removal: "cloudinary_ai",
    });
    fs.unlinkSync(filePath);

    return response;
  } catch (error: any) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    throw new ApiError(500, "Failed to upload file to cloudinary");
  }
};

const deleteFile = async (fileId: string, resource_type: string) => {
  try {
    const publicId = fileId;
    if (!publicId.trim() || !resource_type.trim()) {
      throw new ApiError(400, "Invalid or Empty FileId or ResourceType");
    }
    if (publicId && resource_type) {
      const resposne = await cloudinary.uploader.destroy(publicId, {
        resource_type,
      });
      return resposne;
    } else return false;
  } catch (error) {
    throw new ApiError(500, "Failed to delete file from cloudinary");
  }
};

export { uploadFile, deleteFile };
