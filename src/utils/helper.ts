import { Request } from "express";
import fs from "fs";
import logger from "../loggers/winston.logger";

export const removeLocalFile = (localPath : string) => {
  fs.unlink(localPath, (err) => {
    if (err) logger.error("Error while removing local files: ", err);
    else {
      logger.info("Removed local: ", localPath);
    }
  });
};

export const removeUnusedMulterImageFilesOnError = (req : Request) => {
  try {
    const multerFile = req.file;
    const multerFiles = req.files;

    if (multerFile) {
      // If there is file uploaded and there is validation error
      // We want to remove that file
      removeLocalFile(multerFile.path);
    }

    if(Array.isArray(multerFiles) && multerFiles.length > 0) {
      multerFiles.forEach((file) =>{
        removeLocalFile(file.path);
      })
    }

    if (multerFiles) {
      const filesValueArray = Object.values(multerFiles);
      // If there are multiple files uploaded for more than one fields
      // We want to remove those files as well
      filesValueArray.map((fileFields) => {
        fileFields.map((fileObject : Express.Multer.File) => {
          removeLocalFile(fileObject.path);
        });
      });
    }
  } catch (error) {
    // fail silently
    logger.error("Error while removing image files: ", error);
  }
};