import asyncio
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from auth_manager import authenticate_ws
from session_manager import SessionManager

app = FastAPI(title="Containerized Gemini CLI")
session_manager = SessionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Basic auth scheme (if required)
    if not await authenticate_ws(websocket):
        return

    await session_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Pass data directly into standard input of running process
            await session_manager.send_input(websocket, data)
    except WebSocketDisconnect:
        session_manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    # Container internal bind so docker compose maps natively
    uvicorn.run(app, host="0.0.0.0", port=8765)
