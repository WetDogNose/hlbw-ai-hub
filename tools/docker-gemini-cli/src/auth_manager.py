from fastapi import WebSocket
import os

async def authenticate_ws(websocket: WebSocket) -> bool:
    # Example logic demonstrating how one might lock down the websocket
    # For now, local host isolation via docker compose is the primary barrier
    token = websocket.query_params.get("token")
    expected = os.environ.get("WS_AUTH_TOKEN")
    
    if expected and token != expected:
        await websocket.close(code=1008)
        return False
        
    return True
