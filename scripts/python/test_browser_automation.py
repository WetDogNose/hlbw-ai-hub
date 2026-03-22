import asyncio
from browser.browser_provider import default_browser_provider
from browser.url_checker import UrlChecker
from browser.screenshot import capture_screenshot

async def main():
    print("Testing Python Browser Automation...")
    checker = UrlChecker(default_browser_provider)
    urls = [
        "https://scholar.google.com",
        "https://www.example.com"
    ]

    for url in urls:
        print(f"\nChecking: {url}")
        result = await checker.check_url(url, timeout_s=15)
        print(f"  Live: {result.is_live}")
        print(f"  Status: {result.status_code}")
        print(f"  Resolved: {result.resolved_url}")
        print(f"  Paywall: {result.is_paywall}")
        print(f"  Title: {result.page_title}")

    print("\nCapturing screenshot of example.com...")
    await capture_screenshot(default_browser_provider, "https://www.example.com", "test-py-screenshot.png", timeout_s=15)

    await default_browser_provider.close()
    print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
