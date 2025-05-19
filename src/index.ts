import * as dotenv from 'dotenv';
dotenv.config(); // Load environment variables first

import express from 'express';
import { serve } from 'inngest/express';
import { inngest } from './inngest/client';
import { sendEmailViaResend } from './inngest/functions'; // Import your Inngest functions

const app = express();
app.use(express.json());

// The Inngest /api/inngest endpoint
app.use('/api/inngest', serve({ client: inngest, functions: [sendEmailViaResend] }));

// Example route to trigger an email send event
app.post('/trigger-email', async (req, res) => {
  const { to, from, subject, html, text } = req.body;

  if (!to || !from || !subject) {
    return res.status(400).json({ message: 'Missing required fields: to, from, subject' });
  }

  if (!html && !text) {
    return res.status(400).json({ message: 'Missing required field: html or text must be provided' });
  }

  try {
    // Send an event to Inngest using the entire request body as event data
    // This allows all EmailSendData properties to be passed through
    await inngest.send({
      name: 'email/send', // This is the event name our function listens to
      data: req.body,     // Pass the whole body
    });
    res.status(202).json({ message: 'Email sending event accepted by Inngest.' });
  } catch (error) {
    console.error('Error sending event to Inngest:', error);
    res.status(500).json({ message: 'Failed to send event to Inngest' });
  } 
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Inngest functions served at http://localhost:${port}/api/inngest`);
  console.log(`To trigger a test email, POST to http://localhost:${port}/trigger-email with JSON body: { "to": "your-email@example.com", "from": "sender@example.com", "subject": "Test from Inngest", "html": "<h1>Hello!</h1><p>This is a test email sent via Inngest and Resend.</p>" }`);
});
