import nodemailer from "nodemailer";
import {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USERNAME,
  SMTP_PASSWORD,
  CLIENT_URL,
  COMPANY_NAME,
  SENDEREMAIL,
} from "./env";
import MailGen, { Content } from "mailgen";
import logger from "../loggers/winston.logger";
import { IBooking } from "../models/bookings.model";

interface EmailVerificationTemplate {
  username: string;
  emailVerificationToken: string;
}

interface ResetPasswordTemplate {
  username: string;
  resetPasswordToken: string;
}

interface BookingConfirmationTemplate {
  username: string;
  booking: IBooking;
}

interface MailConfig {
  email: string;
  subject: string;
  template: Content;
}

interface BookingCancellationTemplate {
  username: string;
  booking: IBooking;
}

const formatCurrency = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

const emailVerificationTemplate = ({
  username,
  emailVerificationToken,
}: EmailVerificationTemplate): Content => {
  return {
    body: {
      name: username,
      intro: `Welcome to ${COMPANY_NAME}! We’re excited to have you on board.`,
      action: {
        instructions:
          "To verify your email address, please click the button below:",
        button: {
          color: "#22BC66",
          text: "Verify your email",
          link: `${CLIENT_URL}/verify?token=${emailVerificationToken}`,
        },
      },
      outro: `If you did not sign up for a ${COMPANY_NAME} account, you can safely ignore this email.`,
    },
  };
};

const resetPasswordTemplate = ({
  username,
  resetPasswordToken,
}: ResetPasswordTemplate): Content => {
  return {
    body: {
      name: username,
      intro:
        "You have requested to reset your password. Click the button below to proceed.",
      action: {
        instructions: "To reset your password, please click the button below:",
        button: {
          color: "#D9534F",
          text: "Reset Your Password",
          link: `${CLIENT_URL}/reset-password?token=${resetPasswordToken}`,
        },
      },
      outro:
        "If you did not request a password reset, no further action is required. Your account is safe.",
    },
  };
};

const calculateRentalDays = (startDate: Date, endDate: Date): number => {
  const msInDay = 1000 * 60 * 60 * 24;
  const differenceInDays = Math.round(
    (endDate.getTime() - startDate.getTime()) / msInDay,
  );
  return differenceInDays + 1;
};

const bookingConfirmationTemplate = ({
  username,
  booking,
}: BookingConfirmationTemplate) => {
  const formatCurrency = (amount: number) =>
    `INR ${amount.toLocaleString("en-IN")}/-`;

  const isPartiallyPaid = booking.remainingAmount > 0;
  const intro = isPartiallyPaid
    ? [
        `Thank you for your partial payment! Your booking for a ride with ${COMPANY_NAME} is now reserved.`,
        "To fully confirm your booking, please complete the remaining payment at your earliest convenience.",
      ]
    : [
        `Thank you for choosing ${COMPANY_NAME}! Your booking is fully confirmed.`,
        `We've received your full payment and are getting your ride ready. You can find all the details of your booking below.`,
      ];

  const action = isPartiallyPaid
    ? {
        instructions:
          "You can complete your payment and manage your trip by clicking the button below:",
        button: {
          color: "#FFC107", // A brand-appropriate color
          text: "Pay Remaining Amount",
          link: `${CLIENT_URL}/my-bookings?bookingId=${booking._id}`,
        },
      }
    : {
        instructions:
          "You can view your booking details and manage your trip by clicking the button below:",
        button: {
          color: "#22BC66", // Green for confirmed
          text: "View My Booking",
          link: `${CLIENT_URL}/my-bookings?bookingId=${booking._id}`,
        },
      };

  const outro = isPartiallyPaid
    ? [
        "Please note that your booking is not fully confirmed until the remaining balance is paid.",
        "If you have any questions, just reply to this email—we’re here to help!",
      ]
    : [
        `Please ensure you have the necessary documents ready for pick-up.`,
        `If you have any questions or need to make changes, please don't hesitate to reply to this email. We're here to help!`,
        `Safe travels,`,
        `The ${COMPANY_NAME} Team`,
      ];
  return {
    body: {
      name: username,
      intro: intro,
      action: action,
      dictionary: {
        "Booking ID": `#${booking._id?.toString().slice(-8).toUpperCase()}`,
        "Booking Date": new Date(booking.bookingDate).toLocaleDateString(
          "en-IN",
          {
            day: "numeric",
            month: "long",
            year: "numeric",
          },
        ),
        "Payment Status": booking.paymentStatus,
        "Total Amount": formatCurrency(booking.discountedTotal),
        "Amount Paid": formatCurrency(booking.paidAmount),
        "Amount Remaining": formatCurrency(booking.remainingAmount),
      },
      table: {
        data: booking.items.map((item) => {
          if (!item.motorcycle) return {};
          return {
            Motorcycle: `${item.motorcycle.make} ${item.motorcycle.vehicleModel}`,
            "Pick-up": `${new Date(item.pickupDate).toLocaleDateString(
              "en-IN",
              { day: "numeric", month: "short", year: "numeric" },
            )} at ${item.pickupTime}`,
            "Drop-off": `${new Date(item.dropoffDate).toLocaleDateString(
              "en-IN",
              { day: "numeric", month: "short", year: "numeric" },
            )} at ${item.dropoffTime}`,
            Qty: item.quantity,
            Total: formatCurrency(item.rentAmount),
          };
        }),
        columns: {
          // Adjust widths for better layout
          customWidth: {
            Motorcycle: "25%",
            "Pick-up": "20%",
            "Drop-off": "20%",
            Total: "15%",
          },
          customAlignment: {
            "Rate/Day": "right",
            Qty: "center",
            Total: "right",
          },
        },
      },
      outro: outro,
    },
  };
};

const bookingCancellationTemplate = ({
  username,
  booking,
}: BookingCancellationTemplate): Content => {
  const intro =
    booking.refundAmount > 0
      ? `We have successfully recieved the cancellation request for your booking #${booking._id?.toString().slice(-6).toUpperCase()}. A refund is on its way.`
      : `We have successfully recieved the cancellation request for your booking #${booking._id?.toString().slice(-6).toUpperCase()}.`;

  const outro = [
    "The motorcycle(s) from this booking are now available for others.",
    "We hope to see you again soon for your next adventure!",
    `If you have any questions, just reply to this email—we’re here to help!`,
  ];

  return {
    body: {
      name: username,
      intro: intro,
      dictionary: {
        "Cancellation Reason": booking.cancellationReason || "Not provided",
        "Total Amount Paid": formatCurrency(booking.paidAmount),
        "Cancellation Charges": formatCurrency(booking.cancellationCharge || 0),
        "Refundable Amount": formatCurrency(booking.refundAmount),
      },
      action: {
        instructions:
          "After evaluation of your cancellation request, Your refund will be processed back to your original payment method within 5-7 business days. You can view your updated booking status here:",
        button: {
          color: "#D9534F",
          text: "View My Bookings",
          link: `${CLIENT_URL}/my-bookings`,
        },
      },
      outro: outro,
    },
  };
};

const sendEmail = async (mailConfig: MailConfig) => {
  const mailGenerator = new MailGen({
    theme: "default",
    product: {
      name: `${COMPANY_NAME}`,
      link: `${CLIENT_URL}`,
      logo: "https://res.cloudinary.com/arshitcc/image/upload/v1752870222/logo_zs99pq.png",
      logoHeight: "40px",
    },
  });

  const emailHTML = mailGenerator.generate(mailConfig.template);
  const emailText = mailGenerator.generatePlaintext(mailConfig.template);

  const mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: true, // Required for port 465 with Hostinger
    auth: {
      user: SMTP_USERNAME, // info@torqrides.com
      pass: SMTP_PASSWORD, // Bikeproject@2025
    },
    tls: {
      // Do not fail on invalid certs
      rejectUnauthorized: false
    }
  } as nodemailer.TransportOptions);

  const emailData = {
    from: `TORQ Rides <info@torqrides.com>`, // Hardcode the email address to match the SMTP_USERNAME
    to: mailConfig.email,
    subject: mailConfig.subject,
    text: emailText,
    html: emailHTML,
  };

  try {
    console.log("[EMAIL DEBUG] Attempting to send email");
    console.log("[EMAIL DEBUG] From:", emailData.from);
    console.log("[EMAIL DEBUG] To:", emailData.to);
    console.log("[EMAIL DEBUG] Subject:", emailData.subject);
    console.log("[EMAIL DEBUG] Mail options:", emailData);
    
    const result = await mailer.sendMail(emailData);
    console.log("[EMAIL DEBUG] Email sent successfully!");
    return result;
  } catch (error) {
    /*
      As sending email is not strongly coupled to the business logic it is not worth to raise an error when email sending fails
      So it's better to fail silently rather than breaking the app
    */

    logger.error(
      "Email service failed. Make sure you have provided correct SMTP credentials in the .env file",
    );
    logger.error("Email Error: ", error);
    console.error("[EMAIL DEBUG] Email sending failed:");
    console.error("[EMAIL DEBUG] Error details:", error);
  }
};

export {
  sendEmail,
  emailVerificationTemplate,
  resetPasswordTemplate,
  bookingConfirmationTemplate,
  bookingCancellationTemplate,
};
