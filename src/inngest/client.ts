import { Inngest } from "inngest";
import { Resend } from "resend";
import * as dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

// Initialize Resend client
if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not set in environment variables. Please ensure it's in your .env file.");
}
export const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Inngest client
const isProduction = process.env.NODE_ENV === 'production';

export const inngest = new Inngest({
  id: "resend-email-app",
  // The signing key is used to verify requests from Inngest Cloud in production.
  signingKey: isProduction ? process.env.INNGEST_SIGNING_KEY : undefined,
  // The event key is used for the Inngest Dev Server (local development).
  eventKey: !isProduction ? process.env.INNGEST_EVENT_KEY : undefined,
});
