# Browser Automation Briefing: Playwright + Chrome DevTools Protocol (CDP)

**Date:** March 13, 2026  
**Audience:** Developers building browser automation that needs to survive bot detection  
**Scope:** Playwright with Chrome/CDP, anti-detection techniques, code examples in Python, .NET, and Go

---

## Table of Contents

1. [The Problem: Why Bots Get Blocked](#1-the-problem-why-bots-get-blocked)
2. [The Two-Tier Strategy](#2-the-two-tier-strategy)
3. [How Chrome DevTools Protocol (CDP) Works](#3-how-chrome-devtools-protocol-cdp-works)
4. [Key Anti-Detection Techniques](#4-key-anti-detection-techniques)
5. [Architecture: Real Chrome + Playwright via CDP](#5-architecture-real-chrome--playwright-via-cdp)
6. [Handling Cloudflare & Bot Challenges](#6-handling-cloudflare--bot-challenges)
7. [Fallback Strategy: Headless Chromium](#7-fallback-strategy-headless-chromium)
8. [Code Examples — Python](#8-code-examples--python)
9. [Code Examples — .NET (C#)](#9-code-examples--net-c)
10. [Code Examples — Go](#10-code-examples--go)
11. [Profile Management & Session Persistence](#11-profile-management--session-persistence)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. The Problem: Why Bots Get Blocked

Modern websites — especially academic publishers (ScienceDirect, Springer, Nature, Wiley), government sites, and any site behind Cloudflare/Akamai — use sophisticated bot detection that can identify automated browsers through:

| Detection Vector | What They Check |
|---|---|
| **`navigator.webdriver`** | Set to `true` by default in automated browsers (Selenium, Playwright, Puppeteer) |
| **Automation flags** | Chrome's Blink engine exposes `AutomationControlled` feature flag |
| **Missing browser APIs** | Headless Chrome lacks `chrome.runtime`, `Notification.permission`, `navigator.plugins` |
| **TLS fingerprint** | Headless Chromium has a different TLS handshake (JA3/JA4 hash) than real Chrome |
| **Behavioural signals** | No cookies, no browsing history, no saved sessions, unrealistic viewport, robotic timing |
| **HTTP/2 fingerprint** | Automated browsers produce distinctive HTTP/2 SETTINGS frames |
| **Canvas/WebGL fingerprint** | Headless renderers produce deterministic or absent canvas fingerprints |
| **CDP detection** | Some sites detect active DevTools Protocol connections via side-channel timing |

A plain `playwright.chromium.launch(headless=True)` will fail on most protected sites because it trips multiple signals simultaneously.

---

## 2. The Two-Tier Strategy

The approach used in production combines two tiers:

### Tier 1: Real Chrome via CDP (Primary — High Bot Bypass)

Connect Playwright to a **real, pre-configured Chrome installation** using the Chrome DevTools Protocol. This Chrome instance:

- Uses a **dedicated user profile** with accumulated cookies, browsing history, and logged-in sessions
- Carries a **real TLS fingerprint** (identical to a human user's Chrome)
- Has no `navigator.webdriver` flag (it wasn't launched by an automation framework)
- Has legitimate `chrome.runtime`, `Notification.permission`, and plugin APIs
- Can use `--headless=new` (Chrome's native headless mode) which is indistinguishable from headed Chrome to JavaScript fingerprinters

### Tier 2: Playwright Bundled Chromium (Fallback — Reduced Bypass)

When real Chrome isn't available, fall back to Playwright's bundled Chromium with anti-detection flags:

- `--disable-blink-features=AutomationControlled` — removes the automation flag
- Realistic viewport, user-agent, headers, and locale
- Still detectable by TLS fingerprint and missing browser APIs — works for ~70% of sites

**The key insight**: connecting to a *real* Chrome instance (not Playwright's bundled Chromium) makes you virtually indistinguishable from a human user.

---

## 3. How Chrome DevTools Protocol (CDP) Works

CDP is a debugging protocol built into Chrome (and Chromium-based browsers). When Chrome is launched with `--remote-debugging-port=9222`, it opens a WebSocket server that allows external tools to:

- Navigate pages
- Execute JavaScript
- Take screenshots
- Intercept network requests
- Read/write cookies
- Emulate devices and network conditions

```
┌─────────────────┐     WebSocket (CDP)      ┌──────────────────┐
│                  │ ◄─────────────────────► │                  │
│   Your Code      │   localhost:9222         │   Real Chrome    │
│  (Playwright)    │                          │  (with profile)  │
│                  │                          │                  │
└─────────────────┘                          └──────────────────┘
```

Playwright supports `connectOverCDP()` which wraps the raw CDP connection in Playwright's high-level API — you get the best of both worlds: real Chrome's fingerprint + Playwright's developer-friendly API.

---

## 4. Key Anti-Detection Techniques

### 4.1 Use a Real Chrome Profile with Session State

```
chrome.exe --remote-debugging-port=9222 \
           --user-data-dir="C:\AutomationProfiles\MyProfile" \
           --profile-directory=Default \
           --no-first-run \
           --no-default-browser-check
```

The profile carries:
- **Cookies** — accumulated from prior manual browsing; tells sites you're a returning visitor
- **Login sessions** — institutional journal access, Google account, etc.
- **Browsing history** — creates a fingerprint that looks like a real researcher
- **Local storage / IndexedDB** — many sites store consent/preference state here

### 4.2 Disable Automation Indicators

| Flag/Technique | Purpose |
|---|---|
| `--disable-blink-features=AutomationControlled` | Prevents `navigator.webdriver = true` |
| `--no-first-run` | Suppresses first-run dialogs that reveal a fresh profile |
| `--no-default-browser-check` | Prevents the default browser popup |
| `--disable-extensions` | Optional — some detection scripts look for extension APIs |

### 4.3 Set Realistic Browser Context

When creating new pages/contexts, match what a real desktop user looks like:

```
User-Agent:    Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 
               (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
Viewport:      1280 × 720 (or 1920 × 1080)
Locale:        en-US
Timezone:      America/New_York (or your actual timezone)
Device scale:  1 (not 2 — retina hints at specific hardware)
IsMobile:      false
HasTouch:      false
```

### 4.4 Set Realistic HTTP Headers

Many bot detectors check HTTP request headers. Match what Chrome sends:

```
Accept:           text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8
Accept-Language:  en-US,en;q=0.9
Accept-Encoding:  gzip, deflate, br
DNT:              1
Upgrade-Insecure-Requests: 1
```

### 4.5 Wait for Challenge Resolution

Cloudflare and similar services serve a JavaScript challenge page (usually HTTP 403 or 503 with `text/html`). The challenge runs client-side JavaScript for 2-5 seconds, then redirects to the real page. Your automation must:

1. **Detect the challenge** — look for 403/503 status with HTML content type
2. **Wait for resolution** — don't immediately read the page; wait for URL change or `NetworkIdle`
3. **Add settle time** — even after the redirect, lazy-loaded content may not be ready

### 4.6 Force HTTP/1.1 for Fallback Requests

Many government and institutional sites reject automated HTTP/2 connections. When using `HttpClient` as a fallback, force HTTP/1.1:

```csharp
var request = new HttpRequestMessage(HttpMethod.Get, uri)
{
    Version = new Version(1, 1),
    VersionPolicy = HttpVersionPolicy.RequestVersionExact
};
```

---

## 5. Architecture: Real Chrome + Playwright via CDP

The recommended architecture uses a **singleton browser provider** that manages the Chrome lifecycle:

```
┌──────────────────────────────────────────────────────┐
│                  Browser Provider (Singleton)          │
│                                                        │
│  ┌─────────────────┐                                   │
│  │  GetBrowser()    │─── Fast path: return cached ───► │
│  └─────────────────┘                                   │
│         │                                              │
│         ▼ (first call or reconnect)                    │
│  ┌─────────────────┐     ┌─────────────────────┐      │
│  │ Try Real Chrome  │────►│ ConnectOverCDP()    │      │
│  │ (port 9222)      │     │ localhost:9222      │      │
│  └─────────────────┘     └─────────────────────┘      │
│         │ (failed)                                      │
│         ▼                                              │
│  ┌─────────────────┐     ┌─────────────────────┐      │
│  │ Fallback:        │────►│ Chromium.Launch()   │      │
│  │ Playwright       │     │ (headless, reduced  │      │
│  │ Chromium         │     │  bot bypass)        │      │
│  └─────────────────┘     └─────────────────────┘      │
│                                                        │
│  Consumers:                                            │
│  • URL liveness checker                                │
│  • Screenshot/thumbnail capture                        │
│  • Web scraping                                        │
│  • Form automation                                     │
└──────────────────────────────────────────────────────┘
```

Key design decisions:
- **Singleton browser**: All consumers share one browser instance — avoids port conflicts and reduces memory
- **Lazy initialisation with double-check locking**: Browser connects on first use, not at startup
- **Automatic reconnection**: If Chrome crashes or disconnects, the next `GetBrowser()` call reconnects
- **Graceful degradation**: If real Chrome isn't available, fall back to Playwright's Chromium (reduced capability but still functional)

---

## 6. Handling Cloudflare & Bot Challenges

### Detection

```python
def is_challenge_page(status_code: int, content_type: str) -> bool:
    """Cloudflare/Akamai challenges return 403 or 503 with HTML."""
    return status_code in (403, 503) and "text/html" in content_type
```

### Resolution Strategy

```
1. Navigate to URL
2. If response is 403/503 + text/html:
   a. Wait up to 15 seconds for URL change or DOM update
   b. Wait for DOMContentLoaded on the new page
   c. Re-read the resolved URL and status
3. If response is 200:
   a. Wait for NetworkIdle (max 5 seconds — some pages never stop loading)
   b. Add 2-3 seconds settle time for lazy content
4. Extract page content
```

### Known Challenge Domains

Sites that consistently use heavy bot protection and need extra wait time:

```
sciencedirect.com, springer.com, wiley.com, academic.oup.com,
nature.com, tandfonline.com, mdpi.com, frontiersin.org, 
journals.plos.org, pubmed.ncbi.nlm.nih.gov, jstor.org
```

---

## 7. Fallback Strategy: Headless Chromium

When real Chrome isn't available, launch Playwright's bundled Chromium with maximum anti-detection:

```python
browser = playwright.chromium.launch(
    headless=True,
    args=[
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-http2",
        "--disable-blink-features=AutomationControlled",
    ]
)
```

**Why `--disable-http2`?** Playwright's Chromium has a recognisable HTTP/2 fingerprint. Forcing HTTP/1.1 removes this signal.

**Why `--disable-blink-features=AutomationControlled`?** Prevents `navigator.webdriver` from being set to `true`.

---

## 8. Code Examples — Python

### Prerequisites

```bash
pip install playwright
playwright install chromium
```

### 8.1 Connect to Real Chrome via CDP

```python
import asyncio
import socket
from playwright.async_api import async_playwright


def is_port_open(port: int, host: str = "127.0.0.1", timeout: float = 2.0) -> bool:
    """Check if Chrome's CDP port is accepting connections."""
    try:
        sock = socket.create_connection((host, port), timeout=timeout)
        sock.close()
        return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False


async def connect_real_chrome(port: int = 9222):
    """
    Connect Playwright to a real Chrome instance via CDP.
    
    Chrome must be running with:
        chrome --remote-debugging-port=9222 \
               --user-data-dir="/path/to/dedicated/profile" \
               --profile-directory=Default \
               --no-first-run --no-default-browser-check
    """
    if not is_port_open(port):
        raise RuntimeError(
            f"Chrome is not running on port {port}. Start it with:\n"
            f'  chrome --remote-debugging-port={port} '
            f'--user-data-dir="/path/to/profile" '
            f'--no-first-run --no-default-browser-check'
        )
    
    pw = await async_playwright().start()
    browser = await pw.chromium.connect_over_cdp(
        f"http://localhost:{port}",
        timeout=30_000
    )
    
    print(f"Connected to Chrome via CDP on port {port}")
    print(f"  Using real Chrome: True")
    print(f"  Browser version: {browser.version}")
    
    return pw, browser


async def launch_fallback():
    """
    Fallback: launch Playwright's bundled Chromium with anti-detection flags.
    Reduced bot bypass but functional for most sites.
    """
    pw = await async_playwright().start()
    browser = await pw.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-http2",
            "--disable-blink-features=AutomationControlled",
        ]
    )
    
    print("Launched Playwright headless Chromium (fallback — reduced bot bypass)")
    return pw, browser
```

### 8.2 Full URL Checker with Anti-Detection

```python
import asyncio
from dataclasses import dataclass, field
from playwright.async_api import async_playwright, Browser, Page, Error as PlaywrightError


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

CHALLENGE_DOMAINS = {
    "www.sciencedirect.com", "sciencedirect.com",
    "link.springer.com", "springer.com",
    "onlinelibrary.wiley.com", "wiley.com",
    "www.nature.com", "nature.com",
    "www.tandfonline.com", "tandfonline.com",
}


@dataclass
class CheckResult:
    url: str
    is_live: bool = False
    status_code: int = 0
    resolved_url: str = ""
    is_paywall: bool = False
    page_title: str | None = None
    content_snippet: str | None = None
    error: str | None = None


def is_challenge_page(status_code: int, content_type: str) -> bool:
    """Detect Cloudflare/Akamai bot-protection challenge pages."""
    return status_code in (403, 503) and "text/html" in content_type


async def check_url(browser: Browser, url: str, timeout_s: int = 30) -> CheckResult:
    """
    Check a URL for liveness using a real browser.
    Handles Cloudflare challenges, JS redirects, and paywall detection.
    """
    from urllib.parse import urlparse
    parsed = urlparse(url)
    
    # Create a realistic browser context
    context = await browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1280, "height": 720},
        locale="en-US",
        timezone_id="America/New_York",
        device_scale_factor=1,
        is_mobile=False,
        has_touch=False,
        java_script_enabled=True,
    )
    
    page = await context.new_page()
    
    # Set realistic HTTP headers
    await page.set_extra_http_headers({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
    })
    
    try:
        # Determine timeout — longer for known challenge domains
        is_challenge_domain = parsed.hostname in CHALLENGE_DOMAINS
        nav_timeout = (timeout_s * 2 if is_challenge_domain else timeout_s) * 1000
        
        response = await page.goto(url, timeout=nav_timeout, wait_until="domcontentloaded")
        
        if response is None:
            return CheckResult(url=url, error="No response received")
        
        status = response.status
        content_type = response.headers.get("content-type", "")
        resolved_url = page.url
        
        # Handle bot challenge pages — wait for the challenge to resolve
        if is_challenge_page(status, content_type):
            print(f"  Challenge page detected for {url} — waiting for resolution...")
            try:
                # Wait for the JS challenge to resolve (page reloads/redirects)
                await page.wait_for_url(lambda u: True, timeout=15_000)
                await page.wait_for_load_state("domcontentloaded", timeout=15_000)
                resolved_url = page.url
                status = 200  # Got past the challenge
            except Exception:
                pass  # Timed out — evaluate what we have
        
        # Wait for dynamic content on success
        if 200 <= status < 400:
            try:
                await page.wait_for_load_state("networkidle", timeout=5_000)
            except Exception:
                pass  # Acceptable — we still have DOM content
        
        # Extra settle time for lazy-loaded content
        await asyncio.sleep(2)
        
        # Extract page content
        title = await page.title()
        body_text = await page.evaluate("""
            () => {
                const body = document.body;
                if (!body) return null;
                const clone = body.cloneNode(true);
                clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                return (clone.innerText || clone.textContent || '').substring(0, 2000);
            }
        """)
        
        # Simple paywall detection
        paywall_keywords = [
            "subscribe to read", "purchase this article", "buy this article",
            "sign in to access", "institutional access", "rent this article",
            "full text available to subscribers",
        ]
        is_paywall = any(kw in (body_text or "").lower() for kw in paywall_keywords)
        
        return CheckResult(
            url=url,
            is_live=200 <= status < 400 and not is_paywall,
            status_code=status,
            resolved_url=resolved_url,
            is_paywall=is_paywall,
            page_title=title or None,
            content_snippet=body_text,
        )
    
    except PlaywrightError as e:
        if "net::ERR_ABORTED" in str(e) or "Download is starting" in str(e):
            # PDF or file download — this is actually a live resource
            return CheckResult(
                url=url, is_live=True, status_code=200,
                resolved_url=url, page_title="PDF Document"
            )
        return CheckResult(url=url, error=str(e))
    finally:
        await context.close()


# ── Usage ──

async def main():
    # Tier 1: Try real Chrome via CDP
    try:
        pw, browser = await connect_real_chrome(port=9222)
        print("Using real Chrome — maximum bot bypass\n")
    except RuntimeError:
        # Tier 2: Fallback to Playwright Chromium
        pw, browser = await launch_fallback()
        print("Using Playwright Chromium — reduced bot bypass\n")
    
    urls = [
        "https://www.nature.com/articles/s41586-024-07000-0",
        "https://www.sciencedirect.com/science/article/pii/S0006320724001234",
        "https://scholar.google.com",
    ]
    
    for url in urls:
        print(f"Checking: {url}")
        result = await check_url(browser, url)
        print(f"  Live: {result.is_live}")
        print(f"  Status: {result.status_code}")
        print(f"  Resolved: {result.resolved_url}")
        print(f"  Paywall: {result.is_paywall}")
        print(f"  Title: {result.page_title}")
        print()
    
    await browser.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(main())
```

### 8.3 Screenshot Capture with Bot Bypass

```python
import asyncio
from playwright.async_api import async_playwright, Browser


async def capture_screenshot(
    browser: Browser,
    url: str,
    output_path: str = "screenshot.png",
    timeout_s: int = 30,
) -> bool:
    """
    Capture a screenshot of a URL with full anti-detection.
    Returns True on success, False on failure.
    """
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1280, "height": 960},
        locale="en-US",
        timezone_id="America/New_York",
        device_scale_factor=1,
        is_mobile=False,
        has_touch=False,
    )
    
    page = await context.new_page()
    
    # Realistic headers
    await page.set_extra_http_headers({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Upgrade-Insecure-Requests": "1",
    })
    
    try:
        await page.goto(url, timeout=timeout_s * 1000, wait_until="domcontentloaded")
        
        # Wait for the page to fully settle — Cloudflare challenges resolve
        # via JS redirect after a few seconds
        try:
            await page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass  # Some pages never stop loading
        
        # Additional settle time for lazy images, fonts, challenge redirects
        await asyncio.sleep(3)
        
        # Take screenshot
        await page.screenshot(path=output_path, type="png", full_page=False)
        print(f"Screenshot saved: {output_path}")
        return True
        
    except Exception as e:
        print(f"Screenshot failed: {e}")
        return False
    finally:
        await context.close()
```

### 8.4 Browser Provider Class (Production Pattern)

```python
import asyncio
import socket
from contextlib import asynccontextmanager
from playwright.async_api import async_playwright, Playwright, Browser


class BrowserProvider:
    """
    Singleton browser provider — manages Chrome lifecycle.
    Connects to real Chrome via CDP if available, falls back to Playwright Chromium.
    Thread-safe via asyncio.Lock.
    """
    
    def __init__(self, cdp_port: int = 9222, connection_timeout_s: int = 30):
        self._cdp_port = cdp_port
        self._connection_timeout = connection_timeout_s * 1000
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._lock = asyncio.Lock()
        self._initialized = False
        self._using_real_chrome = False
    
    @property
    def is_using_real_chrome(self) -> bool:
        return self._initialized and self._using_real_chrome
    
    @property
    def is_available(self) -> bool:
        return self._browser is not None and self._browser.is_connected()
    
    async def get_browser(self) -> Browser | None:
        """Get the shared browser instance. Initialises on first call."""
        # Fast path
        if self._initialized and self._browser and self._browser.is_connected():
            return self._browser
        
        async with self._lock:
            # Double-check after acquiring lock
            if self._initialized and self._browser and self._browser.is_connected():
                return self._browser
            
            # Clean up if disconnected
            if self._initialized:
                await self._cleanup()
                self._initialized = False
            
            # Try real Chrome via CDP
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
            
            # Fallback — Playwright headless Chromium
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
```

---

## 9. Code Examples — .NET (C#)

### Prerequisites

```bash
dotnet add package Microsoft.Playwright
# Then install browsers:
pwsh bin/Debug/net10.0/playwright.ps1 install chromium
```

### 9.1 Browser Provider (Singleton Service)

```csharp
using System.Net.Sockets;
using Microsoft.Playwright;

/// <summary>
/// Singleton browser provider for .NET applications.
/// Connects to real Chrome via CDP for maximum bot bypass,
/// falls back to Playwright's bundled Chromium.
/// </summary>
public sealed class BrowserProvider : IAsyncDisposable
{
    private readonly int _cdpPort;
    private readonly int _connectionTimeoutMs;
    
    private IPlaywright? _playwright;
    private IBrowser? _browser;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private bool _initialized;
    private bool _usingFallback;

    public BrowserProvider(int cdpPort = 9222, int connectionTimeoutSeconds = 30)
    {
        _cdpPort = cdpPort;
        _connectionTimeoutMs = connectionTimeoutSeconds * 1000;
    }

    /// <summary>True if connected to real Chrome (not fallback Chromium).</summary>
    public bool IsUsingRealChrome => _initialized && !_usingFallback;

    /// <summary>True if any browser is available.</summary>
    public bool IsAvailable => _browser?.IsConnected == true;

    /// <summary>
    /// Get the shared browser instance. Initialises on first call.
    /// Returns null if neither Chrome nor fallback can be started.
    /// </summary>
    public async Task<IBrowser?> GetBrowserAsync(CancellationToken ct = default)
    {
        // Fast path — already connected
        if (_initialized && _browser?.IsConnected == true)
            return _browser;

        await _initLock.WaitAsync(ct);
        try
        {
            // Double-check after acquiring lock
            if (_initialized && _browser?.IsConnected == true)
                return _browser;

            if (_initialized)
            {
                await CleanupAsync();
                _initialized = false;
            }

            // ── Tier 1: Real Chrome via CDP ──
            if (IsPortOpen(_cdpPort))
            {
                try
                {
                    _playwright = await Playwright.CreateAsync();
                    _browser = await _playwright.Chromium.ConnectOverCDPAsync(
                        $"http://localhost:{_cdpPort}",
                        new BrowserTypeConnectOverCDPOptions
                        {
                            Timeout = _connectionTimeoutMs
                        });
                    
                    _usingFallback = false;
                    _initialized = true;
                    Console.WriteLine($"Connected to Chrome via CDP (port {_cdpPort})");
                    return _browser;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"CDP connection failed: {ex.Message}");
                    _playwright?.Dispose();
                    _playwright = null;
                }
            }

            // ── Tier 2: Playwright headless Chromium ──
            try
            {
                _playwright = await Playwright.CreateAsync();
                _browser = await _playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
                {
                    Headless = true,
                    Args =
                    [
                        "--no-sandbox",
                        "--disable-gpu",
                        "--disable-dev-shm-usage",
                        "--disable-http2",
                        "--disable-blink-features=AutomationControlled"
                    ]
                });
                
                _usingFallback = true;
                _initialized = true;
                Console.WriteLine("Launched Playwright Chromium (fallback — reduced bot bypass)");
                return _browser;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Fallback launch failed: {ex.Message}");
                _playwright?.Dispose();
                _playwright = null;
                return null;
            }
        }
        finally
        {
            _initLock.Release();
        }
    }

    private static bool IsPortOpen(int port, int timeoutMs = 2000)
    {
        try
        {
            using var client = new TcpClient();
            return client.ConnectAsync("127.0.0.1", port).Wait(timeoutMs);
        }
        catch
        {
            return false;
        }
    }

    private async Task CleanupAsync()
    {
        if (_browser is not null)
        {
            try { await _browser.CloseAsync(); } catch { }
            _browser = null;
        }
        _playwright?.Dispose();
        _playwright = null;
    }

    public async ValueTask DisposeAsync()
    {
        await CleanupAsync();
        _initLock.Dispose();
    }
}
```

### 9.2 URL Liveness Checker with Anti-Detection

```csharp
using Microsoft.Playwright;

public record LivenessResult(
    bool IsLive,
    int StatusCode,
    string? ResolvedUrl = null,
    bool IsPaywall = false,
    string? PageTitle = null,
    string? ContentSnippet = null,
    string? Error = null
);

public class UrlChecker
{
    private readonly BrowserProvider _browserProvider;
    
    private const string UserAgent =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    
    private static readonly HashSet<string> ChallengeDomains = new(StringComparer.OrdinalIgnoreCase)
    {
        "www.sciencedirect.com", "link.springer.com", "onlinelibrary.wiley.com",
        "www.nature.com", "www.tandfonline.com", "www.jstor.org"
    };

    public UrlChecker(BrowserProvider browserProvider) => _browserProvider = browserProvider;

    public async Task<LivenessResult> CheckAsync(string url, CancellationToken ct = default)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return new LivenessResult(false, 0, Error: "Invalid URL");

        var browser = await _browserProvider.GetBrowserAsync(ct);
        if (browser is null)
            return new LivenessResult(false, 0, Error: "No browser available");

        // Create a realistic browser context
        var context = await browser.NewContextAsync(new BrowserNewContextOptions
        {
            UserAgent = UserAgent,
            ViewportSize = new ViewportSize { Width = 1280, Height = 720 },
            Locale = "en-US",
            TimezoneId = "America/New_York",
            DeviceScaleFactor = 1,
            IsMobile = false,
            HasTouch = false,
            JavaScriptEnabled = true
        });

        try
        {
            var page = await context.NewPageAsync();
            
            // Set realistic HTTP headers
            await page.SetExtraHTTPHeadersAsync(new Dictionary<string, string>
            {
                ["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                ["Accept-Language"] = "en-US,en;q=0.9",
                ["Accept-Encoding"] = "gzip, deflate, br",
                ["DNT"] = "1",
                ["Upgrade-Insecure-Requests"] = "1"
            });

            var isChallengeDomain = ChallengeDomains.Contains(uri.Host);
            var navigationTimeout = (isChallengeDomain ? 60_000 : 30_000);

            IResponse? response;
            try
            {
                response = await page.GotoAsync(url, new PageGotoOptions
                {
                    Timeout = navigationTimeout,
                    WaitUntil = WaitUntilState.DOMContentLoaded
                });
            }
            catch (PlaywrightException ex) when (
                ex.Message.Contains("net::ERR_ABORTED") ||
                ex.Message.Contains("Download is starting"))
            {
                // PDF/download — it's alive
                return new LivenessResult(true, 200, url, PageTitle: "PDF Document");
            }

            if (response is null)
                return new LivenessResult(false, 0, url, Error: "No response");

            var statusCode = response.Status;
            var contentType = response.Headers.GetValueOrDefault("content-type") ?? "";
            var resolvedUrl = page.Url;

            // Handle bot challenge pages — wait for JS resolution
            if (statusCode is 403 or 503 && contentType.Contains("text/html"))
            {
                try
                {
                    await page.WaitForURLAsync(_ => true, new() { Timeout = 15_000 });
                    await page.WaitForLoadStateAsync(LoadState.DOMContentLoaded,
                        new() { Timeout = 15_000 });
                    resolvedUrl = page.Url;
                    statusCode = 200;
                }
                catch (TimeoutException) { /* evaluate what we have */ }
            }

            // Wait for dynamic content
            if (statusCode is >= 200 and < 400)
            {
                try { await page.WaitForLoadStateAsync(LoadState.NetworkIdle,
                    new() { Timeout = 5_000 }); } catch { }
            }

            // Extract visible text
            var title = await page.TitleAsync();
            var bodyText = await page.EvaluateAsync<string?>("""
                () => {
                    const body = document.body;
                    if (!body) return null;
                    const clone = body.cloneNode(true);
                    clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
                    return (clone.innerText || clone.textContent || '').substring(0, 2000);
                }
            """);

            return new LivenessResult(
                IsLive: statusCode is >= 200 and < 400,
                StatusCode: statusCode,
                ResolvedUrl: resolvedUrl,
                PageTitle: title,
                ContentSnippet: bodyText
            );
        }
        finally
        {
            await context.CloseAsync();
        }
    }
}
```

### 9.3 ASP.NET Core DI Registration

```csharp
// Program.cs — register the browser provider as a singleton
builder.Services.AddSingleton<BrowserProvider>();
builder.Services.AddScoped<UrlChecker>();

// Configuration (appsettings.json):
// {
//   "Chrome": {
//     "ExePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
//     "UserDataDir": "C:\\AutomationProfiles\\MyProfile",
//     "ProfileName": "Default",
//     "RemoteDebuggingPort": 9222,
//     "Headless": true,
//     "ConnectionTimeoutSeconds": 30
//   }
// }
```

---

## 10. Code Examples — Go

### Prerequisites

```bash
go get github.com/playwright-community/playwright-go
# Install browsers:
go run github.com/playwright-community/playwright-go/cmd/playwright@latest install --with-deps chromium
```

### 10.1 Browser Provider

```go
package browser

import (
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/playwright-community/playwright-go"
)

// Provider manages a shared Chrome/Playwright browser instance.
// Connects to real Chrome via CDP when available, falls back to Playwright Chromium.
type Provider struct {
	cdpPort           int
	connectionTimeout float64 // milliseconds

	mu             sync.Mutex
	pw             *playwright.Playwright
	browser        playwright.Browser
	initialized    bool
	usingRealChrome bool
}

// NewProvider creates a browser provider targeting the given CDP port.
func NewProvider(cdpPort int, connectionTimeoutSeconds int) *Provider {
	return &Provider{
		cdpPort:           cdpPort,
		connectionTimeout: float64(connectionTimeoutSeconds * 1000),
	}
}

// IsUsingRealChrome returns true if connected to real Chrome (not fallback).
func (p *Provider) IsUsingRealChrome() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.initialized && p.usingRealChrome
}

// GetBrowser returns the shared browser instance. Initialises on first call.
func (p *Provider) GetBrowser() (playwright.Browser, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Fast path — already connected
	if p.initialized && p.browser != nil && p.browser.IsConnected() {
		return p.browser, nil
	}

	// Cleanup if disconnected
	if p.initialized {
		p.cleanup()
		p.initialized = false
	}

	// ── Tier 1: Real Chrome via CDP ──
	if isPortOpen(p.cdpPort) {
		pw, err := playwright.Run()
		if err == nil {
			cdpURL := fmt.Sprintf("http://localhost:%d", p.cdpPort)
			browser, err := pw.Chromium.ConnectOverCDP(cdpURL, playwright.BrowserTypeConnectOverCDPOptions{
				Timeout: &p.connectionTimeout,
			})
			if err == nil {
				p.pw = pw
				p.browser = browser
				p.usingRealChrome = true
				p.initialized = true
				fmt.Printf("Connected to Chrome via CDP (port %d)\n", p.cdpPort)
				return p.browser, nil
			}
			pw.Stop()
		}
		fmt.Printf("CDP connection failed, falling back to Playwright Chromium\n")
	}

	// ── Tier 2: Playwright headless Chromium ──
	pw, err := playwright.Run()
	if err != nil {
		return nil, fmt.Errorf("failed to start Playwright: %w", err)
	}

	headless := true
	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: &headless,
		Args: []string{
			"--no-sandbox",
			"--disable-gpu",
			"--disable-dev-shm-usage",
			"--disable-http2",
			"--disable-blink-features=AutomationControlled",
		},
	})
	if err != nil {
		pw.Stop()
		return nil, fmt.Errorf("failed to launch fallback Chromium: %w", err)
	}

	p.pw = pw
	p.browser = browser
	p.usingRealChrome = false
	p.initialized = true
	fmt.Println("Launched Playwright Chromium (fallback — reduced bot bypass)")
	return p.browser, nil
}

// Close releases all browser resources.
func (p *Provider) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cleanup()
}

func (p *Provider) cleanup() {
	if p.browser != nil {
		_ = p.browser.Close()
		p.browser = nil
	}
	if p.pw != nil {
		_ = p.pw.Stop()
		p.pw = nil
	}
}

func isPortOpen(port int) bool {
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 2*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}
```

### 10.2 URL Checker with Anti-Detection

```go
package browser

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/playwright-community/playwright-go"
)

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

var challengeDomains = map[string]bool{
	"www.sciencedirect.com":    true,
	"link.springer.com":       true,
	"onlinelibrary.wiley.com": true,
	"www.nature.com":          true,
	"www.tandfonline.com":     true,
	"www.jstor.org":           true,
}

// CheckResult holds the outcome of a URL liveness check.
type CheckResult struct {
	URL            string
	IsLive         bool
	StatusCode     int
	ResolvedURL    string
	IsPaywall      bool
	PageTitle      string
	ContentSnippet string
	Error          string
}

// CheckURL checks a URL for liveness using a real browser with anti-detection.
func CheckURL(provider *Provider, rawURL string, timeoutSeconds int) (*CheckResult, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return &CheckResult{URL: rawURL, Error: "Invalid URL"}, nil
	}

	b, err := provider.GetBrowser()
	if err != nil {
		return nil, fmt.Errorf("no browser available: %w", err)
	}

	// Create a realistic browser context
	isMobile := false
	hasTouch := false
	scaleFactor := float64(1)
	jsEnabled := true

	context, err := b.NewContext(playwright.BrowserNewContextOptions{
		UserAgent:         playwright.String(userAgent),
		Viewport:          &playwright.Size{Width: 1280, Height: 720},
		Locale:            playwright.String("en-US"),
		TimezoneId:        playwright.String("America/New_York"),
		DeviceScaleFactor: &scaleFactor,
		IsMobile:          &isMobile,
		HasTouch:          &hasTouch,
		JavaScriptEnabled: &jsEnabled,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create context: %w", err)
	}
	defer context.Close()

	page, err := context.NewPage()
	if err != nil {
		return nil, fmt.Errorf("failed to create page: %w", err)
	}

	// Set realistic HTTP headers
	_ = page.SetExtraHTTPHeaders(map[string]string{
		"Accept":                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language":           "en-US,en;q=0.9",
		"Accept-Encoding":           "gzip, deflate, br",
		"DNT":                       "1",
		"Upgrade-Insecure-Requests": "1",
	})

	// Longer timeout for known challenge domains
	navTimeout := float64(timeoutSeconds * 1000)
	if challengeDomains[parsed.Host] {
		navTimeout *= 2
	}

	response, err := page.Goto(rawURL, playwright.PageGotoOptions{
		Timeout:   &navTimeout,
		WaitUntil: playwright.WaitUntilStateDomcontentloaded,
	})
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "net::ERR_ABORTED") ||
			strings.Contains(errMsg, "Download is starting") {
			return &CheckResult{
				URL: rawURL, IsLive: true, StatusCode: 200,
				ResolvedURL: rawURL, PageTitle: "PDF Document",
			}, nil
		}
		return &CheckResult{URL: rawURL, Error: errMsg}, nil
	}

	if response == nil {
		return &CheckResult{URL: rawURL, Error: "No response"}, nil
	}

	statusCode := response.Status()
	contentType := ""
	if ct, ok := response.Headers()["content-type"]; ok {
		contentType = ct
	}
	resolvedURL := page.URL()

	// Handle bot challenge pages
	if (statusCode == 403 || statusCode == 503) && strings.Contains(contentType, "text/html") {
		fmt.Printf("  Challenge page detected for %s — waiting...\n", rawURL)
		challengeTimeout := float64(15_000)
		_ = page.WaitForURL("**/*", playwright.PageWaitForURLOptions{
			Timeout: &challengeTimeout,
		})
		loadTimeout := float64(15_000)
		_ = page.WaitForLoadState(playwright.LoadStateDomcontentloaded, playwright.PageWaitForLoadStateOptions{
			Timeout: &loadTimeout,
		})
		resolvedURL = page.URL()
		statusCode = 200
	}

	// Wait for dynamic content
	if statusCode >= 200 && statusCode < 400 {
		idleTimeout := float64(5000)
		_ = page.WaitForLoadState(playwright.LoadStateNetworkidle, playwright.PageWaitForLoadStateOptions{
			Timeout: &idleTimeout,
		})
	}

	// Settle time
	time.Sleep(2 * time.Second)

	// Extract content
	title, _ := page.Title()
	bodyText, _ := page.Evaluate(`() => {
		const body = document.body;
		if (!body) return '';
		const clone = body.cloneNode(true);
		clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
		return (clone.innerText || clone.textContent || '').substring(0, 2000);
	}`)

	snippet := ""
	if bodyText != nil {
		snippet = fmt.Sprintf("%v", bodyText)
	}

	return &CheckResult{
		URL:            rawURL,
		IsLive:         statusCode >= 200 && statusCode < 400,
		StatusCode:     statusCode,
		ResolvedURL:    resolvedURL,
		PageTitle:      title,
		ContentSnippet: snippet,
	}, nil
}
```

### 10.3 Usage (main.go)

```go
package main

import (
	"fmt"
	"yourmodule/browser"
)

func main() {
	// Create the browser provider — will try real Chrome on port 9222 first
	provider := browser.NewProvider(9222, 30)
	defer provider.Close()

	urls := []string{
		"https://www.nature.com/articles/s41586-024-07000-0",
		"https://scholar.google.com",
	}

	for _, u := range urls {
		fmt.Printf("Checking: %s\n", u)
		result, err := browser.CheckURL(provider, u, 30)
		if err != nil {
			fmt.Printf("  Error: %v\n", err)
			continue
		}
		fmt.Printf("  Live:     %v\n", result.IsLive)
		fmt.Printf("  Status:   %d\n", result.StatusCode)
		fmt.Printf("  Resolved: %s\n", result.ResolvedURL)
		fmt.Printf("  Title:    %s\n", result.PageTitle)
		fmt.Println()
	}
}
```

---

## 11. Profile Management & Session Persistence

### Why a Dedicated Profile Matters

The single most effective anti-detection measure is using a **real Chrome profile** with accumulated state:

| Profile State | Bot Detection Impact |
|---|---|
| **Cookies** | Sites see a "returning visitor" — dramatically reduces suspicion |
| **Login sessions** | Bypasses paywalls via institutional access; avoids login prompts |
| **Browsing history** | Creates a realistic fingerprint that matches a real researcher |
| **LocalStorage / IndexedDB** | Many consent/preference systems check for prior state |
| **TLS session tickets** | Real Chrome's TLS stack produces authentic JA3/JA4 hashes |
| **Canvas/WebGL state** | Real Chrome's GPU pipeline produces genuine rendering fingerprints |

### Setting Up a Profile

```bash
# Step 1: Create an isolated profile directory
mkdir -p /path/to/automation-profile

# Step 2: Launch Chrome with the profile (close other Chrome instances first)
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/path/to/automation-profile" \
  --profile-directory=Default \
  --no-first-run \
  --no-default-browser-check

# Step 3: In the Chrome window, manually:
#   - Sign into Google (if needed for your use case)
#   - Sign into academic publishers / institutional SSO
#   - Browse a few representative pages to build cookie state
#   - Visit Google Scholar, search for papers

# Step 4: Close Chrome. The profile is now ready for automation.
```

### Warming the Profile

Browse a few pages manually to build a realistic fingerprint:

1. Visit academic publishers and browse abstracts
2. Search on Google Scholar
3. Visit government environmental/science sites
4. Let pages load fully — this builds a realistic cookie and cache footprint

### Session Maintenance

| Session Type | Lifetime | Maintenance |
|---|---|---|
| Google Account | Weeks–months | Re-authenticate when expired (launch Chrome visible) |
| Institutional SSO | Weeks–months | Re-authenticate via institution's login page |
| Publisher cookies | Days–weeks | Most renew automatically from the base cookie |
| Cloudflare tokens | Hours | Renew automatically if the base profile is trusted |

---

## 12. Common Pitfalls

### ❌ Don't: Use Playwright's Default Launch

```python
# BAD — immediately detectable as a bot
browser = playwright.chromium.launch()
page = browser.new_page()
await page.goto("https://sciencedirect.com/...")  # → Blocked by Cloudflare
```

### ✅ Do: Connect to Real Chrome via CDP

```python
# GOOD — indistinguishable from a human user
browser = await playwright.chromium.connect_over_cdp("http://localhost:9222")
```

### ❌ Don't: Use Default Headers

```python
# BAD — no Accept-Language, missing standard headers
await page.goto(url)
```

### ✅ Do: Set Realistic Headers

```python
await page.set_extra_http_headers({
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "DNT": "1",
})
```

### ❌ Don't: Read the Page Immediately After Navigation

```python
# BAD — Cloudflare challenge page hasn't resolved yet
await page.goto(url)
content = await page.content()  # → Gets the challenge HTML, not the real page
```

### ✅ Do: Wait for Challenge Resolution + Settle Time

```python
await page.goto(url, wait_until="domcontentloaded")
try:
    await page.wait_for_load_state("networkidle", timeout=10_000)
except:
    pass
await asyncio.sleep(3)  # Settle time for lazy content
content = await page.content()  # → Gets the real page
```

### ❌ Don't: Use HTTP/2 for Fallback HTTP Requests

```python
# BAD — automated HTTP/2 fingerprint is recognisable
response = requests.get(url)  # Uses HTTP/2 by default in modern clients
```

### ✅ Do: Force HTTP/1.1 for Non-Browser Requests

```csharp
// GOOD — HTTP/1.1 has a less distinctive fingerprint
var request = new HttpRequestMessage(HttpMethod.Get, uri)
{
    Version = new Version(1, 1),
    VersionPolicy = HttpVersionPolicy.RequestVersionExact
};
```

### ❌ Don't: Share Your Default Chrome Profile

Using `--user-data-dir` pointing to your normal Chrome profile will:
- Interfere with your regular browsing
- Cause "Chrome is already running" errors
- Risk exposing personal data

### ✅ Do: Use an Isolated Profile Directory

```bash
# Create a dedicated directory — separate from your daily Chrome profile
mkdir -p /path/to/automation-profile
```

### ❌ Don't: Delete the Profile Directory Regularly

The accumulated cookies and browsing history ARE the anti-detection mechanism. Deleting the profile resets your bot-detection bypass capability.

### ❌ Don't: Run Multiple CDP Connections to the Same Port

Chrome only accepts one CDP controller at a time. Running two automation scripts against port 9222 simultaneously will cause connection failures.

### ✅ Do: Use a Singleton Browser Provider

Share a single browser instance across all consumers via a thread-safe singleton (as shown in the code examples above).

---

## Summary

| Technique | Effectiveness | Complexity |
|---|---|---|
| Real Chrome + CDP + dedicated profile | ★★★★★ | Medium (one-time setup) |
| Real Chrome + CDP + fresh profile | ★★★★☆ | Low |
| Playwright Chromium + anti-detection flags | ★★★☆☆ | Low |
| Playwright Chromium + default settings | ★☆☆☆☆ | None |
| Plain HTTP client | ☆☆☆☆☆ | None |

The **real Chrome + CDP + dedicated profile** approach is what we use in production. It's the only reliable way to access bot-protected academic publishers, government sites behind Cloudflare, and services that require authenticated sessions. The one-time profile setup takes ~15 minutes and pays dividends on every subsequent automation run.

