import { BrowserProvider } from './BrowserProvider';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function captureScreenshot(
  browserProvider: BrowserProvider,
  url: string,
  outputPath = 'screenshot.png',
  timeoutSeconds = 30
): Promise<boolean> {
  const browser = await browserProvider.getBrowser();
  if (!browser) {
    console.error('No browser available for screenshot');
    return false;
  }

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 960 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });

  const page = await context.newPage();

  await page.setExtraHTTPHeaders({
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    DNT: '1',
    'Upgrade-Insecure-Requests': '1',
  });

  try {
    await page.goto(url, {
      timeout: timeoutSeconds * 1000,
      waitUntil: 'domcontentloaded',
    });

    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch (e) {
      // ignore
    }

    await new Promise(r => setTimeout(r, 3000));

    await page.screenshot({ path: outputPath, type: 'png', fullPage: false });
    console.log(`Screenshot saved: ${outputPath}`);
    return true;
  } catch (ex: any) {
    console.error(`Screenshot failed: ${ex.message}`);
    return false;
  } finally {
    await context.close();
  }
}
