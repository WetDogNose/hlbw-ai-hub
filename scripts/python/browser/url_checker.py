import asyncio
from dataclasses import dataclass
from urllib.parse import urlparse
from playwright.async_api import Error as PlaywrightError
from .browser_provider import BrowserProvider

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
    "www.jstor.org", "jstor.org",
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

class UrlChecker:
    def __init__(self, provider: BrowserProvider):
        self.provider = provider

    async def check_url(self, url: str, timeout_s: int = 30) -> CheckResult:
        """
        Check a URL for liveness using a real browser.
        Handles Cloudflare challenges, JS redirects, and paywall detection.
        """
        parsed = urlparse(url)
        
        browser = await self.provider.get_browser()
        if not browser:
            return CheckResult(url=url, error="No browser available")

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
