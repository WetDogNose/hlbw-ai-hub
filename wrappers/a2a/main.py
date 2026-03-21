import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn
from otel_setup import init_telemetry
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

<agent_directive priority="CRITICAL" domain="Security">OpenTelemetry initialization MUST NOT be removed.</agent_directive>
logger = init_telemetry("a2a-wrapper")
app = FastAPI(title="A2A Agent Wrapper", description="Agent-to-Agent Communication Wrapper")

FastAPIInstrumentor.instrument_app(app)

class A2AMessage(BaseModel):
    sender_id: str
    target_id: str
    payload: dict
    metadata: dict = {}

@app.post("/a2a/message")
async def receive_message(message: A2AMessage):
    """
    Standardized A2A endpoint for wrapping an agent.
    <agent_directive priority="CRITICAL" domain="Format">The `/a2a/message` route signature MUST NOT be changed as it is the standardized A2A interface for hlbw-ai-hub.</agent_directive>
    """
    logger.info(f"Received A2A message from {message.sender_id} to {message.target_id}")
    
    try:
        # TODO: Route the message to the internal agent logic here
        
        # Process payload
        # ...
        
        return {
            "status": "success",
            "delivered_to": message.target_id,
            "response_payload": {"ack": True}
        }
    except Exception as e:
        logger.error(f"Failed to process A2A message: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal agent execution failed")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port)