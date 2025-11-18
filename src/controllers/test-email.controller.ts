import { Request, Response } from "express";
import asyncHandler from "../utils/async-handler";
import { sendEmail } from "../utils/mail";
import { ApiResponse } from "../utils/api-response";

const testEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json(new ApiResponse(400, false, "Email is required", null));
  }
  
  try {
    await sendEmail({
      email,
      subject: "Email Test from TORQ Rides",
      template: {
        body: {
          name: "Test User",
          intro: "This is a test email to verify that the email configuration is working correctly.",
          outro: "If you received this email, it means your email configuration is working properly!"
        }
      }
    });
    
    return res.status(200).json(
      new ApiResponse(200, true, "Test email sent successfully! Check your inbox.", null)
    );
  } catch (error) {
    console.error("Test email sending failed:", error);
    return res.status(500).json(
      new ApiResponse(500, false, "Failed to send test email. Check server logs for details.", null)
    );
  }
});

export { testEmail };
