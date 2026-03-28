import pexpect
import asyncio
import os

class PtyManager:
    def __init__(self):
        self.process = None

    def start_gemini_cli(self, callback):
        # We spawn a pseudo-terminal so that standard outputs flush instantly 
        # API token is taken dynamically from the Docker environment (zero-config)
        self.process = pexpect.spawn('sh', ['-c', 'npx @google/gemini-cli'], encoding='utf-8')
        asyncio.create_task(self._read_output(callback))

    async def _read_output(self, callback):
        if not self.process:
            return
            
        try:
            while True:
                # Read character by character for responsive streaming
                char = self.process.read_nonblocking(size=1, timeout=0.1)
                await callback(char)
        except pexpect.EOF:
            print("[PTY] Process Terminated")
        except pexpect.TIMEOUT:
            # Continue polling if timeout hits
            await asyncio.sleep(0)
            await self._read_output(callback)
            
    def write(self, data):
        if self.process and self.process.isalive():
            self.process.send(data)
            
    def kill(self):
        if self.process and self.process.isalive():
            self.process.terminate(force=True)
