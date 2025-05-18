import { inngest, resend } from "./client";

interface EmailSendData {
  to: string;
  from: string;
  subject: string;
  html: string;
  // Add any other Resend options you need, e.g., cc, bcc, reply_to, text
}

export const sendEmailViaResend = inngest.createFunction(
  { 
    id: "send-email-via-resend", 
    name: "Send Email via Resend",
    // Limit concurrency to 2 calls at any one time
    concurrency: {
      limit: 2,
    }
  },
  { event: "email/send" }, // This is the event name that will trigger this function
  async ({ event, step }) => {
    const { to, from, subject, html } = event.data as EmailSendData;

    await step.run("send-email-to-user", async () => {
      try {
        const { data, error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
        });

        if (error) {
          console.error("Resend API Error:", error);
          // You might want to throw the error to let Inngest handle retries based on your function's retry policy
          throw error; 
        }

        console.log(`Email sent successfully to ${to}, ID: ${data?.id}`);
        return { success: true, messageId: data?.id };
      } catch (err) {
        console.error("Failed to send email:", err);
        // Propagate the error for Inngest to handle retries
        throw err;
      }
    });

    return { eventName: event.name, status: "Email processed" };
  }
);
