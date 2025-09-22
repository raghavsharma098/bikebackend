import Razorpay from "razorpay";
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from "./env";


let razorpayInstance: Razorpay | undefined;

// Only initialize Razorpay if both keys are provided
console.log("RAZORPAY DEBUG: Checking environment variables");
console.log("RAZORPAY_KEY_ID:", RAZORPAY_KEY_ID ? `${RAZORPAY_KEY_ID.substring(0, 10)}...` : "NOT SET");
console.log("RAZORPAY_KEY_SECRET:", RAZORPAY_KEY_SECRET ? `${RAZORPAY_KEY_SECRET.substring(0, 10)}...` : "NOT SET");
console.log("RAZORPAY_KEY_ID type:", typeof RAZORPAY_KEY_ID);
console.log("RAZORPAY_KEY_SECRET type:", typeof RAZORPAY_KEY_SECRET);

if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  try {
    console.log("RAZORPAY DEBUG: Attempting to create instance...");
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET,
    });
    console.log("RAZORPAY DEBUG: Instance created successfully");
  } catch (error) {
    console.error("RAZORPAY ERROR: ", error);
  }
} else {
  console.warn("Razorpay initialization skipped: Missing API keys in environment variables");
  console.warn("RAZORPAY_KEY_ID present:", !!RAZORPAY_KEY_ID);
  console.warn("RAZORPAY_KEY_SECRET present:", !!RAZORPAY_KEY_SECRET);
}

export default razorpayInstance;
