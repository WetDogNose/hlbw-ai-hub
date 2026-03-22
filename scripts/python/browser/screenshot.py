import asyncio
from .browser_provider import BrowserProvider

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

async def capture_screenshot(
    provider: BrowserProvider,
    url: str,
    output_path: str = "screenshot.png",
    timeout_s: int = 30,
) -> bool:
    """
    Capture a screenshot of a URL with full anti-detection.
    Returns True on success, False on failure.
    """
    browser = await provider.get_browser()
    if not browser:
        print("No browser available for screenshot")
        return False

    context = await browser.new_context(
        user_agent=USER_AGENT,
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
        
        try:
            await page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass
        
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
