import multer from "multer";
import { ApiError } from "../utils/api-error";
import { Request } from "express";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/images");
  },
  filename: function (req, file, cb) {
    let fileExtension = "";
    if (file.originalname.split(".").length > 1) {
      fileExtension = file.originalname.substring(
        file.originalname.lastIndexOf("."),
      );
    }
    const filenameWithoutExtension = file.originalname
      .toLowerCase()
      .split(" ")
      .join("-")
      ?.split(".")[0];

    cb(
      null,
      // avoid name conflict
      filenameWithoutExtension +
        Date.now() +
        Math.ceil(Math.random() * 1e5) +
        fileExtension,
    );
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: any) => {
  // Allowed mime types
  const allowedMimes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        400,
        "Invalid file type. Only PDF and image files are allowed.",
      ),
      false,
    );
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1000 * 1000,
  },
});
