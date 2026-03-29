import sys
import json
import logging
import asyncio
import traceback
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Try to import formal A2A SDK, otherwise define graceful fallback constants
try:
    import a2a_sdk
except ImportError:
    a2a_sdk = None

# A persistent context object can be held here
contexts = {}

def clear_context(session_id: str):
    if session_id in contexts:
        del contexts[session_id]
        logger.info(f"Session context {session_id} purged.")

async def handle_a2a_message(request_data: dict) -> dict:
    """
    Handles a standard A2A protocol JSON-RPC or message payload.
    This demonstrates processing a complex objective delegated by the Master Agent.
    """
    logger.info(f"Received A2A payload: {json.dumps(request_data)}")
    
    task_id = request_data.get("task_id", "req-123")
    session_id = request_data.get("session_id", task_id)
    message = request_data.get("message", "")
    context_data = request_data.get("context", {})
    worktree = context_data.get("worktree", "/workspace")
    is_persistent = context_data.get("persistence_mode") == "persistent"

    logger.info(f"Processing task {task_id} for session {session_id} in {worktree}")
    
    try:
        os.chdir(worktree)
        logger.info(f"Changed directory to {worktree}")
    except Exception as e:
        logger.warning(f"Could not change directory to {worktree}: {e}")

    await asyncio.sleep(1) # simulate python work
    
    if not is_persistent:
        clear_context(session_id)

    response = {
        "version": "1.0",
        "status": "success",
        "task_id": task_id,
        "result": {
            "processed": True,
            "agent_id": "python-sub-agent-01",
            "reply": f"Python successfully analyzed the objective: '{message}'",
            "metadata": {
                "engine": "python-a2a-worker",
                "a2a_sdk_present": a2a_sdk is not None
            }
        }
    }
    return response

class A2AHttpRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/a2a':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                
                # Execute async function in a synchronous context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                response_data = loop.run_until_complete(handle_a2a_message(payload))
                loop.close()

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode('utf-8'))
            except Exception as e:
                logger.error(f"Error processing A2A payload: {e}")
                logger.error(traceback.format_exc())
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_http_server(port=8000):
    server_address = ('0.0.0.0', port)
    httpd = HTTPServer(server_address, A2AHttpRequestHandler)
    logger.info(f"Python A2A Worker listening on HTTP port {port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    logger.info("Python A2A Worker shutting down.")

if __name__ == "__main__":
    run_http_server(8000)
