import asyncio
# import time # Removed unused import
from datetime import timedelta
from dataclasses import dataclass
from typing import Dict, Any, List
import httpx
import os

from temporalio import workflow, activity
from temporalio.client import Client
from temporalio.worker import Worker

# Define the data structure for email requests
@dataclass
class EmailRequest:
    to: str
    subject: str
    body: str
    from_email: str
    metadata: Dict[str, Any] = None


# Activity to send email via Resend
@activity.defn
async def send_email_activity(request: EmailRequest, resend_api_key: str) -> str:
    headers = {
        "Authorization": f"Bearer {resend_api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "from": request.from_email,
        "to": request.to,
        "subject": request.subject,
        "html": request.body
    }
    
    if request.metadata:
        payload.update(request.metadata)
    
    async with httpx.AsyncClient() as http_client:
        response = await http_client.post("https://api.resend.com/emails", headers=headers, json=payload)

    if response.status_code >= 400:
        error_content = response.text
        activity.logger.error(f"Resend API Error ({response.status_code}): {error_content}")
        raise Exception(f"Resend API Error ({response.status_code}): {error_content}")

    response_json = response.json()
    activity.logger.info(f"Email sent successfully to {request.to}, Resend ID: {response_json.get('id')}")
    return response_json.get("id")


# Define the Workflow
@workflow.defn
class EmailWorkflow:
    @workflow.run
    async def run(self, request: EmailRequest) -> str:
        return await workflow.execute_activity(
            send_email_activity, 
            request, 
            start_to_close_timeout=timedelta(seconds=60), 
        )


# Main function to run the Worker
async def main_worker():
    resend_api_key = os.getenv("RESEND_API_KEY")
    if not resend_api_key:
        print("Error: RESEND_API_KEY environment variable not set.")
        return

    try:
        client = await Client.connect("localhost:7233") 
    except Exception as e:
        print(f"Failed to connect to Temporal server: {e}")
        print("Please ensure the Temporal server is running.")
        return

    # Create and run the worker
    worker = Worker(
        client,
        task_queue="resend-email-task-queue", 
        workflows=[EmailWorkflow],        
        activities=[lambda req: send_email_activity(req, resend_api_key=resend_api_key)], 
        max_concurrent_activities=2,         
    )
    
    print("Starting Temporal Worker for 'resend-email-task-queue'...")
    print(f"Max concurrent activities: {worker.max_concurrent_activities}")
    try:
        await worker.run()
    except KeyboardInterrupt:
        print("\nWorker shutdown requested.")
    except Exception as e:
        print(f"Worker failed: {e}")
    finally:
        print("Worker stopped.")


if __name__ == "__main__":
    print("Preparing to start the Temporal worker...")
    asyncio.run(main_worker())