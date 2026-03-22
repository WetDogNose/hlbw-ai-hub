import asyncio
import socket
from typing import Optional
from playwright.async_api import async_playwright, Playwright, Browser

class BrowserProvider:
    """
    Singleton browser provider - manages Chrome lifecycle.
    Connects to real Chrome via CDP if available, falls back to Playwright Chromium.
    Thread-safe via asyncio.Lock.
    """
    
    def __init__(self, cdp_port: int = 9222, connection_timeout_s: int = 30):
        self._cdp_port = cdp_port
        self._connection_timeout = connection_timeout_s * 1000
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._lock = asyncio.Lock()
        self._initialized = False
        self._using_real_chrome = False
    
    @property
    def is_using_real_chrome(self) -> bool:
        return self._initialized and self._using_real_chrome
    
    @property
    def is_available(self) -> bool:
        return self._browser is not None and self._browser.is_connected()
    
    async def get_browser(self) -> Optional[Browser]:
        """Get the shared browser instance. Initializes on first call."""
        if self._initialized and self._browser and self._browser.is_connected():
            return self._browser
        
        async with self._lock:
            if self._initialized and self._browser and self._browser.is_connected():
                return self._browser
            
            if self._initialized:
                await self._cleanup()
                self._initialized = False
            
            if self._is_port_open():
                try:
                    self._playwright = await async_playwright().start()
                    self._browser = await self._playwright.chromium.connect_over_cdp(
                        f"http://localhost:{self._cdp_port}",
                        timeout=self._connection_timeout,
                    )
                    self._using_real_chrome = True
                    self._initialized = True
                    print(f"Connected to Chrome via CDP (port {self._cdp_port})")
                    return self._browser
                except Exception as e:
                    print(f"CDP connection failed: {e}")
                    if self._playwright:
                        await self._playwright.stop()
                        self._playwright = None
            
            try:
                self._playwright = await async_playwright().start()
                self._browser = await self._playwright.chromium.launch(
                    headless=True,
                    args=[
                        "--no-sandbox",
                        "--disable-gpu",
                        "--disable-dev-shm-usage",
                        "--disable-http2",
                        "--disable-blink-features=AutomationControlled",
                    ],
                )
                self._using_real_chrome = False
                self._initialized = True
                print("Launched Playwright Chromium (fallback)")
                return self._browser
            except Exception as e:
                print(f"Fallback launch failed: {e}")
                if self._playwright:
                    await self._playwright.stop()
                    self._playwright = None
                return None
    
    def _is_port_open(self) -> bool:
        try:
            sock = socket.create_connection(("127.0.0.1", self._cdp_port), timeout=2.0)
            sock.close()
            return True
        except (socket.timeout, ConnectionRefusedError, OSError):
            return False
    
    async def _cleanup(self):
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None
    
    async def close(self):
        async with self._lock:
            await self._cleanup()
            self._initialized = False

# Global instance
default_browser_provider = BrowserProvider()
