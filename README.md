# Resend Email Queue with Inngest

This project demonstrates how to use Inngest to queue email sending with Resend, respecting API rate limits (specifically, Resend's 2 requests/second limit by setting concurrency to 2).

## Project Structure

```
.
├── .env.example        # Example environment variables
├── .gitignore          # Git ignore file
├── package.json        # Project dependencies and scripts
├── README.md           # This file
├── tsconfig.json       # TypeScript configuration
└── src
    ├── index.ts        # Express server setup, Inngest middleware, and example trigger route
    └── inngest
        ├── client.ts   # Inngest and Resend client initialization
        └── functions.ts # Inngest function for sending emails via Resend
```

## Setup Instructions

1.  **Clone the repository (if applicable) or ensure you have the files created.**

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root of the project by copying `.env.example`:
    ```bash
    cp .env.example .env
    ```
    Open the `.env` file and add your Resend API key:
    ```env
    RESEND_API_KEY=your_resend_api_key_here
    # Optional: For Inngest Dev Server. Generate one with `npx inngest-cli dev -u http://localhost:3000/api/inngest`
    INNGEST_EVENT_KEY=your_inngest_event_key_here 
    # Optional: For signing/verifying Inngest requests in production
    # INNGEST_SIGNING_KEY=your_inngest_signing_key_here
    ```
    You can get your Resend API key from the [Resend Dashboard](https://resend.com/api-keys).

## Running the Application

1.  **Build the TypeScript code:**
    ```bash
    npm run build
    ```

2.  **Start the server:**
    ```bash
    npm start
    ```
    This will start the Express server, usually on `http://localhost:3000`.

## Development with Inngest Dev Server

For local development, the Inngest Dev Server is highly recommended. It allows you to test your functions without deploying them and provides a UI to inspect events and function runs.

1.  **Start your application in development mode:**
    This script typically uses `ts-node-dev` or similar for hot-reloading.
    ```bash
    npm run dev
    ```
    Your Express server will start (e.g., on `http://localhost:3000`), and your Inngest functions will be served at `/api/inngest`.

2.  **Start the Inngest Dev Server:**
    In a new terminal, run:
    ```bash
    npx inngest-cli dev -u http://localhost:3000/api/inngest
    ```
    This will open the Inngest Dev Server dashboard (usually at `http://localhost:8288`). It will use the `INNGEST_EVENT_KEY` from your `.env` file if provided, or you can follow its prompts to set one up. If you don't have an `INNGEST_EVENT_KEY` in your `.env`, the dev server will generate a temporary one for you to use.

## Triggering an Email

Once the server is running (either with `npm start` or `npm run dev`), you can trigger an email by sending a POST request to the `/trigger-email` endpoint. The event payload now supports a wider range of parameters from Resend's API, including `text` content, `cc`, `bcc`, `reply_to`, `headers`, `attachments` (as string content or path), and `tags`.

Below is an example using `curl` with some of these optional parameters. Remember that either `html` or `text` content (or both) is required.

Using `curl`:
```bash
curl -X POST http://localhost:3000/trigger-email \
-H "Content-Type: application/json" \
-d '{
  "to": "recipient@example.com", 
  "from": "Your Name <sender@yourdomain.com>", 
  "subject": "Test Email via Inngest & Resend (with more params)", 
  "html": "<h1>Hello from Inngest!</h1><p>This email was rate-limited by Inngest and includes more parameters.</p>",
  "text": "Hello from Inngest! This email was rate-limited by Inngest and includes more parameters.",
  "cc": ["cc.recipient1@example.com", "cc.recipient2@example.com"],
  "bcc": "bcc.recipient@example.com",
  "reply_to": "replies@yourdomain.com",
  "tags": [
    { "name": "category", "value": "transactional" },
    { "name": "customer-id", "value": "12345" }
  ]
}'
```

Replace `recipient@example.com` with an actual email address you can check, and `sender@yourdomain.com` with a domain you've verified with Resend.

If you are using the Inngest Dev Server, you can also trigger the `email/send` event directly from its UI, providing the JSON payload with the desired parameters.

## How it Works

1.  When you POST to `/trigger-email`, the Express app sends an event named `email/send` to Inngest.
2.  The Inngest function `sendEmailViaResend` (defined in `src/inngest/functions.ts`) is configured to listen for `email/send` events.
3.  This function has a `concurrency` setting of `{ limit: 2 }`. This tells Inngest to process no more than 2 instances of this function at the same time.
4.  If many email events are sent quickly, Inngest queues them and executes them respecting this concurrency limit, thereby adhering to Resend's rate limit of 2 API calls per second.
5.  The function then uses the Resend SDK to make the actual API call to send the email.
