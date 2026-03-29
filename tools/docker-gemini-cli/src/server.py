import asyncio
import os
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from auth_manager import authenticate_ws
from session_manager import SessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Containerized Gemini CLI A2A Worker")
session_manager = SessionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    if not await authenticate_ws(websocket):
        return

    await session_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            
            # Try to decode as an A2A JSON payload
            try:
                if data.strip().startswith("{"):
                    payload = json.loads(data)
                    logger.info(f"Received A2A payload: {payload.get('task_id')}")
                    
                    is_ephemeral = payload.get("context", {}).get("persistence_mode") != "persistent"
                    instruction = payload.get("message", "")
                    
                    # Soft clear the context if it is ephemeral
                    if is_ephemeral:
                        logger.info("Soft-clearing context via PTY `gemini clear`")
                        await session_manager.send_input(websocket, "gemini clear\n")
                        await asyncio.sleep(0.5) # Wait for clear to process
                    
                    # Send the actual instruction to the PTY
                    if instruction:
                        await session_manager.send_input(websocket, instruction + "\n")
                        
                    continue
            except json.JSONDecodeError:
                pass # Fall back to raw text feeding

            # If not JSON, pass data directly into standard input of running process
            await session_manager.send_input(websocket, data)
            
    except WebSocketDisconnect:
        session_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    # Container internal bind so docker compose maps natively
    uvicorn.run(app, host="0.0.0.0", port=8000)
