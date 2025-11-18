import mongoose from "mongoose";
import logger from "../loggers/winston.logger";

const connectDB = async () => {
  try {
    // For MongoDB Atlas connections, we need to handle the connection string differently
    // Atlas connection strings should not have the database appended with a slash
    let mongoUri;
    let connectionInstance;
    
    if (process.env.MONGODB_URL?.includes('mongodb+srv')) {
      // For Atlas, use the URL as is and specify the database name as an option
      mongoUri = process.env.MONGODB_URL;
      connectionInstance = await mongoose.connect(mongoUri, {
        dbName: process.env.MONGODB_NAME
      });
    } else {
      // For standard MongoDB connections, append the database name to the URL
      mongoUri = `${process.env.MONGODB_URL}/${process.env.MONGODB_NAME}`;
      connectionInstance = await mongoose.connect(mongoUri);
    }
    logger.info(
      `\n☘️  MongoDB Connected! Db host: ${connectionInstance.connection.host}\n`,
    );
  } catch (error) {
    logger.error("MongoDB Connection Error: ", error);
    process.exit(1);
  }
};

export default connectDB;
