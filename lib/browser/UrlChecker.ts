import { BrowserProvider } from './BrowserProvider';
import { Page } from 'playwright';

export interface CheckResult {
  url: string;
  isLive: boolean;
  statusCode: number;
  resolvedUrl?: string;
  isPaywall: boolean;
  pageTitle?: string;
  contentSnippet?: string;
  error?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHALLENGE_DOMAINS = new Set([
  'www.sciencedirect.com',
  'link.springer.com',
  'onlinelibrary.wiley.com',
  'www.nature.com',
  'www.tandfonline.com',
  'www.jstor.org',
]);

export class UrlChecker {
  private browserProvider: BrowserProvider;

  constructor(browserProvider: BrowserProvider) {
    this.browserProvider = browserProvider;
  }

  async checkAsync(url: string, timeoutSeconds = 30): Promise<CheckResult> {
    try {
      new URL(url);
    } catch {
      return { url, isLive: false, statusCode: 0, isPaywall: false, error: 'Invalid URL' };
    }

    const browser = await this.browserProvider.getBrowser();
    if (!browser) {
      return { url, isLive: false, statusCode: 0, isPaywall: false, error: 'No browser available' };
    }

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
    });

    try {
      const page = await context.newPage();

      await page.setExtraHTTPHeaders({
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        DNT: '1',
        'Upgrade-Insecure-Requests': '1',
      });

      const parsedUrl = new URL(url);
      const isChallengeDomain = CHALLENGE_DOMAINS.has(parsedUrl.hostname);
      const navigationTimeout = (isChallengeDomain ? 60 : timeoutSeconds) * 1000;

      let response;
      try {
        response = await page.goto(url, {
          timeout: navigationTimeout,
          waitUntil: 'domcontentloaded',
        });
      } catch (ex: any) {
        if (ex.message.includes('net::ERR_ABORTED') || ex.message.includes('Download is starting')) {
          return { url, isLive: true, statusCode: 200, resolvedUrl: url, isPaywall: false, pageTitle: 'PDF Document' };
        }
        return { url, isLive: false, statusCode: 0, isPaywall: false, error: ex.message };
      }

      if (!response) {
        return { url, isLive: false, statusCode: 0, isPaywall: false, error: 'No response' };
      }

      let statusCode = response.status();
      const contentType = response.headers()['content-type'] ?? '';
      let resolvedUrl = page.url();

      if ((statusCode === 403 || statusCode === 503) && contentType.includes('text/html')) {
        console.log(`  Challenge page detected for ${url} — waiting...`);
        try {
          await page.waitForURL('**/*', { timeout: 15000 });
          await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
          resolvedUrl = page.url();
          statusCode = 200;
        } catch (e) {
            // timeout evaluating challenge
        }
      }

      if (statusCode >= 200 && statusCode < 400) {
        try {
          await page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch (e) {
            // timeout waiting for idle
        }
      }

      await new Promise(r => setTimeout(r, 2000));

      const title = await page.title();
      const bodyText = await page.evaluate(() => {
        const body = document.body;
        if (!body) return null;
        const clone = body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
        return (clone.innerText || clone.textContent || '').substring(0, 2000);
      });

      return {
        url,
        isLive: statusCode >= 200 && statusCode < 400,
        statusCode,
        resolvedUrl,
        pageTitle: title,
        contentSnippet: bodyText || undefined,
        isPaywall: false,
      };
    } finally {
      await context.close();
    }
  }
}
