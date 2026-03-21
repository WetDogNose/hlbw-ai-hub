import sys
import json
import logging
import asyncio
import traceback

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Try to import formal A2A SDK, otherwise define graceful fallback constants
try:
    import a2a_sdk
except ImportError:
    a2a_sdk = None

async def handle_a2a_message(request_data: dict) -> dict:
    """
    Handles a standard A2A protocol JSON-RPC or message payload.
    This demonstrates processing a complex objective delegated by the Master Agent.
    """
    logger.info(f"Received A2A payload: {json.dumps(request_data)}")
    
    # Process the task
    message = request_data.get("message", "")
    task_id = request_data.get("task_id", "req-123")
    
    logger.info(f"Processing task {task_id}: {message}")
    await asyncio.sleep(1) # simulate work
    
    # Construct an A2A response
    response = {
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

async def run_stdio_server():
    """
    A persistent standard IO server for A2A communication,
    allowing the Node.js Master Agent to maintain a persistent connection.
    """
    logger.info("Python A2A Worker started in STDIO mode.")
    logger.info("AWAITING_REQUESTS") # Signal to Node that we are ready
    
    # Read from stdin continuously using a thread to avoid Windows Proactor issues
    import threading
    
    loop = asyncio.get_running_loop()
    
    def read_stdin():
        while True:
            try:
                line = sys.stdin.readline()
                if not line:
                    break
                line_str = line.strip()
                if not line_str:
                    continue
                
                # Process the payload in the main event loop
                try:
                    payload = json.loads(line_str)
                    # We schedule the coroutine and fire-and-forget, or wait. 
                    # To ensure ordered stdout, we can use a queue or just run it.
                    asyncio.run_coroutine_threadsafe(process_and_respond(payload), loop)
                except json.JSONDecodeError:
                    logger.error(f"Received malformed JSON over A2A stdio: {line_str}")
            except Exception as e:
                logger.error(f"Error reading Stdio: {e}")
                break

    async def process_and_respond(payload):
        try:
            response = await handle_a2a_message(payload)
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
        except Exception as e:
            logger.error(f"Error processing A2A payload: {e}")
            logger.error(traceback.format_exc())

    thread = threading.Thread(target=read_stdin, daemon=True)
    thread.start()
    
    # Keep the main loop alive
    while thread.is_alive():
        await asyncio.sleep(0.5)

if __name__ == "__main__":
    try:
        asyncio.run(run_stdio_server())
    except KeyboardInterrupt:
        logger.info("Python A2A Worker shutting down.")
