import { Request, Response } from "express";
import asyncHandler from "../utils/async-handler";
import { ApiResponse } from "../utils/api-response";
import { sendEmail } from "../utils/mail";

export const testEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  
  if (!email) {
    return res
      .status(400)
      .json(new ApiResponse(400, false, "Email address is required"));
  }

  try {
    await sendEmail({
      email,
      subject: "Test Email from TORQ Rides",
      template: {
        body: {
          name: "Test User",
          intro: "This is a test email to verify the SMTP configuration is working correctly.",
          outro: "If you received this email, it means the email configuration is correct."
        }
      }
    });

    return res
      .status(200)
      .json(new ApiResponse(200, true, `Test email sent to ${email}`));
  } catch (error) {
    console.error("Email test failed:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, false, "Failed to send test email. Check server logs."));
  }
});
