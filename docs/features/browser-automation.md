# Browser Automation (Anti-Detection)

**Scope:** Playwright with Chrome/CDP, anti-detection techniques, code examples in TypeScript and Python for the AI Hub project.

---

## 1. The Problem: Why Bots Get Blocked

Modern websites (e.g., academic publishers, government sites, or any site behind Cloudflare/Akamai) use sophisticated bot detection that identifies automated browsers through:

| Detection Vector | What They Check |
|---|---|
| **`navigator.webdriver`** | Set to `true` by default in automated browsers (Selenium, Playwright, Puppeteer). |
| **Automation flags** | Chrome's Blink engine exposes `AutomationControlled` feature flag. |
| **Missing browser APIs** | Headless Chrome lacks `chrome.runtime`, `Notification.permission`, `navigator.plugins`. |
| **TLS fingerprint** | Headless Chromium has a different TLS handshake (JA3/JA4 hash) than real Chrome. |
| **Behavioural signals** | No cookies, no history, no saved sessions, unrealistic viewport, robotic timing. |
| **HTTP/2 fingerprint** | Automated browsers produce distinctive HTTP/2 SETTINGS frames. |
| **Canvas/WebGL fingerprint** | Headless renderers produce deterministic or absent canvas fingerprints. |

A simple `chromium.launch({ headless: true })` fails on protected sites because it trips multiple signals simultaneously.

---

## 2. The Two-Tier Strategy

To guarantee maximum access, our implementations use a two-tiered fallback approach.

### Tier 1: Real Chrome via CDP (Primary — High Bot Bypass)
Connects Playwright to a **real, pre-configured Chrome installation** using the Chrome DevTools Protocol. 
- Uses a **dedicated user profile** with accumulated cookies, history, and logged-in sessions.
- Carries a **real TLS fingerprint**.
- Has legitimate browser extension APIs and native hardware rendering.

### Tier 2: Playwright Bundled Chromium (Fallback — Reduced Bypass)
When real Chrome isn't available, we fall back to Playwright's bundled Chromium with maximum anti-detection flags:
- `--disable-blink-features=AutomationControlled` removes the automation flag.
- `--disable-http2` mitigates browser HTTP/2 fingerprinting.
- Viewports and User-Agents are modified to look like real desktop traffic.

---

## 3. Architecture

In both TypeScript and Python, this is implemented as a **Singleton Browser Provider** that manages the Chrome lifecycle.

```text
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
└──────────────────────────────────────────────────────┘
```

**Design Benefits:**
- Shared instances avoid memory bloat and CDP port conflicts.
- Lazy initialization handles connections on first-use.
- Graceful degradation ensures the automation keeps working, even if the primary local Chrome is closed.

---

## 4. Key Anti-Detection Techniques Managed by `UrlChecker`

Along with navigating the browser, the `UrlChecker` utility actively works to solve bot-protection challenges:

1. **Realistic Contexts:** Forces Mac OS X Chrome User-Agent strings, timezone (`America/New_York`), and generic HTTP Headers (`Accept`, `DNT=1`, `Upgrade-Insecure-Requests=1`).
2. **Cloudflare JS Challenges:** It detects HTTP 403 or 503 pages serving `text/html`. When detected, it will wait up to 15 seconds for the resolving JS-redirect challenge to complete automatically.
3. **Dynamic Loading:** Once past the challenge, it waits up to 5 seconds for `networkidle`, and provides an extra 2-3 seconds for fonts, images, and lazy React/Vue components to populate the DOM before extracting text.

---

## 5. TypeScript Usage

The TS implementation is located in `lib/browser/`.

### Checking a URL (Liveness & Paywall Bypass)
```typescript
import { defaultBrowserProvider } from '../lib/browser/BrowserProvider';
import { UrlChecker } from '../lib/browser/UrlChecker';

async function checkUrl() {
  const checker = new UrlChecker(defaultBrowserProvider);
  
  // Checks URL, waiting up to 30 seconds
  const result = await checker.checkAsync('https://scholar.google.com', 30);
  
  console.log('Live:', result.isLive); // true if HTTP 200 and no paywall
  console.log('Title:', result.pageTitle);
  console.log('Content:', result.contentSnippet);
  
  await defaultBrowserProvider.close();
}
```

### Taking a Screenshot
```typescript
import { defaultBrowserProvider } from '../lib/browser/BrowserProvider';
import { captureScreenshot } from '../lib/browser/Screenshot';

async function takeScreenshot() {
  await captureScreenshot(
    defaultBrowserProvider, 
    'https://news.ycombinator.com', 
    'screenshot.png', 
    30
  );
  await defaultBrowserProvider.close();
}
```

---

## 6. Python Usage

The Python implementation is located in `scripts/python/browser/`.

### Checking a URL
```python
import asyncio
from scripts.python.browser.browser_provider import default_browser_provider
from scripts.python.browser.url_checker import UrlChecker

async def check_url():
    checker = UrlChecker(default_browser_provider)
    result = await checker.check_url("https://scholar.google.com", timeout_s=30)
    
    print("Live:", result.is_live)
    print("Title:", result.page_title)
    
    await default_browser_provider.close()

if __name__ == "__main__":
    asyncio.run(check_url())
```

---

## 7. Profile Management & Session Persistence

The single most effective anti-detection measure is using a **real Chrome profile** with accumulated state. 

### Setting Up a Tier 1 Automation Profile
Do not use your personal daily-driver Chrome profile for this. Use an isolated directory.

**1. Launch your dedicated profile (close other Chrome windows first if needed):**
```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\AutomationProfiles\MyProfile" --profile-directory=Default --no-first-run --no-default-browser-check
```

**2. Warm the Profile Manually:**
- Sign into Google/Institutional Accounts if required.
- Browse a few representative pages (visit academic publishers, scroll abstracts).
- Perform a few searches on Google Scholar.
- This creates realistic cookies, history, and IndexedDB state that bots lack.

**3. Leave it running:** You can minimize the chrome window. When the AI agents or toolchains attempt to open a browser, they will bind to port 9222 and use this session. 

---

## 8. Common Pitfalls

### ❌ Don't: Delete the Automation Profile Directory
The accumulated cookies and history *are* the anti-detection mechanism. Deleting the folder resets your bot-detection bypass score to zero.

### ❌ Don't: Scrape the DOM Immediately After `page.goto`
Cloudflare will serve a 403 challenge page, and checking `.innerText` too fast will just yield "Verify you are human". Let the `UrlChecker` wait for the JS redirect.

### ❌ Don't: Use Multiple Simultaneous Browsers Pointing at Port 9222
Chrome only accepts one CDP controller at a time. Sharing the `BrowserProvider` singleton across your script is critical to prevent connection resets and conflicts.
