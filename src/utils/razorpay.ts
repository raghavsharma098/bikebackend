import Razorpay from "razorpay";
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from "./env";


let razorpayInstance: Razorpay | undefined;

// Only initialize Razorpay if both keys are provided
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  try {
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
  } catch (error) {
    console.error("RAZORPAY ERROR: ", error);
  }
} else {
  console.warn("Razorpay initialization skipped: Missing API keys in environment variables");
}

export default razorpayInstance;
