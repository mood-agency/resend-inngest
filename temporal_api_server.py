# api_server.py
import asyncio
import os
import uuid # For unique workflow IDs
from fastapi import FastAPI, HTTPException, Body
from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError

# Assuming EmailRequest is in temporal.py
# Make sure temporal.py is in your PYTHONPATH or same directory
from temporal import EmailRequest # This line imports the dataclass

# Global variable for the Temporal client, initialized on startup
temporal_client: Client = None

app = FastAPI(title="Email Workflow Trigger API")

@app.on_event("startup")
async def startup_event():
    global temporal_client
    try:
        # Connect to Temporal server (same as your worker)
        temporal_client = await Client.connect("localhost:7233")
        print("Successfully connected to Temporal server.")
    except Exception as e:
        print(f"Failed to connect to Temporal server on startup: {e}")
        # Depending on your needs, you might want to exit or handle this more gracefully
        # For now, we'll let it proceed and fail on request if client is None

@app.post("/trigger-email")
async def trigger_email_workflow(
    # FastAPI will automatically try to parse the JSON body into an EmailRequest object
    email_details: EmailRequest = Body(...)
):
    if temporal_client is None:
        raise HTTPException(status_code=503, detail="Temporal client not available. Check server connection.")

    # Generate a unique workflow ID. You might want a more sophisticated strategy.
    workflow_id = f"email-workflow-{uuid.uuid4()}"

    try:
        print(f"Attempting to start workflow '{workflow_id}' with task queue 'resend-email-task-queue'")
        # Start the EmailWorkflow defined in your temporal.py
        await temporal_client.start_workflow(
            "EmailWorkflow",          # The name of the workflow class
            email_details,            # The argument for the workflow's run method
            id=workflow_id,
            task_queue="resend-email-task-queue", # Must match the worker's task queue
            # You can also set workflow_execution_timeout, workflow_run_timeout, etc.
        )
        return {"message": "Email workflow started successfully", "workflow_id": workflow_id}
    except WorkflowAlreadyStartedError:
        # This can happen if the workflow_id is not unique and a workflow with that ID is already running.
        # Depending on your design, you might want to signal the existing workflow or return an error.
        raise HTTPException(status_code=409, detail=f"Workflow with ID '{workflow_id}' already started.")
    except Exception as e:
        print(f"Error starting workflow: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start email workflow: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    # This will run the FastAPI server.
    # Your Temporal worker (temporal.py) should be run in a separate process.
    uvicorn.run(app, host="0.0.0.0", port=8001) # Using a different port, e.g., 8001