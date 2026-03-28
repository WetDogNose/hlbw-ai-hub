from fastapi import WebSocket
from pty_manager import PtyManager

class SessionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, PtyManager] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        pty = PtyManager()
        self.active_connections[websocket] = pty
        
        # Callback to pipe the PTY output directly back over the socket
        async def on_output(data):
            try:
                await websocket.send_text(data)
            except Exception:
                pass
                
        pty.start_gemini_cli(on_output)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            pty = self.active_connections.pop(websocket)
            pty.kill()

    async def send_input(self, websocket: WebSocket, data: str):
        if websocket in self.active_connections:
            self.active_connections[websocket].write(data)
