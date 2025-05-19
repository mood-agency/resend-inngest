import { inngest, resend } from "./client";
import { CreateEmailOptions, CreateEmailRequestOptions } from 'resend'; // Corrected import for types

// Base interface for common email parameters, compatible with Resend's options
interface EmailSendDataBase {
  from: string;
  to: string | string[];
  subject: string;
  bcc?: string | string[];
  cc?: string | string[];
  reply_to?: string | string[];
  headers?: Record<string, string>;
  attachments?: Array<{
    filename?: string;
    content?: string | Buffer; // Resend SDK can handle Buffer, but for JSON events, stick to string (e.g., base64)
    path?: string;
  }>;
  tags?: Array<{ name: string; value: string }>;
  // Note: 'react' property from Resend's CreateEmailOptions is omitted as it's not JSON-serializable directly.
  // If you need to send React emails, you'd typically render to string first and pass as 'html'.
}

// Union type ensuring at least html or text is present for the event payload.
// This makes our event data align with a subset of Resend's CreateEmailOptions.
type EmailSendData =
  | (EmailSendDataBase & { html: string; text?: string; }) 
  | (EmailSendDataBase & { text: string; html?: string; }); 

export const sendEmailViaResend = inngest.createFunction(
  { 
    id: "send-email-via-resend", 
    name: "Send Email via Resend",
    // Previous concurrency limit (commented out):
    // concurrency: {
    //   limit: 2,
    // }

    // Explicit rate limit for more precise control
    rateLimit: {
      key: "resend-api", // A key to identify this rate limit (can be any string, ensure it's a simple string not a JSON string)
      limit: 2,        // Allow 2 executions
      period: "1s",    // Per 1 second period
    },
    retries: 3,
  },
  { event: "email/send" }, // This is the event name that will trigger this function
  async ({ event, step }) => {
    const emailPayload = event.data as EmailSendData; // Assumed to conform by the event sender

    // The type EmailSendData now ensures either html or text is present.
    // A runtime check for malformed events (e.g. from external systems) can still be useful.
    if (typeof emailPayload.html !== 'string' && typeof emailPayload.text !== 'string') {
      // This case should ideally not happen if events are constructed correctly according to EmailSendData type.
      // Throw a non-retriable error because the input data is fundamentally flawed.
      // Note: Inngest.NonRetriableError is the conceptual way; check Inngest docs for exact class if available,
      // otherwise, a standard error here and Inngest might retry a few times before giving up.
      // For now, logging and letting Resend SDK potentially fail (which will retry) is one option,
      // or throwing a specific error type you define.
      console.error(
        `Critical: Email event (ID: ${event.id}) is malformed - missing both html and text content. This indicates an issue with event creation.`
      );
      // To prevent retries for such a malformed event, you might throw a specific error that you configure Inngest not to retry
      // or use Inngest.NonRetriableError if available in your Inngest version.
      throw new Error("Malformed email event: Missing html or text content.");
    }

    await step.run("send-email-to-user", async () => {
      try {
        // Our EmailSendData is designed to be a valid subset of CreateEmailOptions for JSON payloads.
        // The Resend SDK will perform its own comprehensive validation.
        const { data, error } = await resend.emails.send(emailPayload as CreateEmailOptions);

        if (error) {
          console.error(`Resend API Error for event ${event.id}:`, JSON.stringify(error));
          throw error; 
        }

        console.log(`Email sent successfully via event ${event.id} to ${JSON.stringify(emailPayload.to)}, Resend ID: ${data?.id}`);
        return { success: true, messageId: data?.id };
      } catch (err: any) {
        console.error(`Failed to send email for event ${event.id}:`, err.message || err);
        throw err;
      }
    });

    return { eventName: event.name, status: "Email processed" };
  }
);
