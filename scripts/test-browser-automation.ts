import { defaultBrowserProvider } from '../lib/browser/BrowserProvider';
import { UrlChecker } from '../lib/browser/UrlChecker';
import { captureScreenshot } from '../lib/browser/Screenshot';

async function main() {
  console.log('Testing TypeScript Browser Automation...');
  
  const checker = new UrlChecker(defaultBrowserProvider);
  const urls = [
    'https://scholar.google.com',
    'https://www.example.com'
  ];

  for (const url of urls) {
    console.log(`\nChecking: ${url}`);
    const result = await checker.checkAsync(url, 15);
    console.log(`  Live: ${result.isLive}`);
    console.log(`  Status: ${result.statusCode}`);
    console.log(`  Resolved: ${result.resolvedUrl}`);
    console.log(`  Paywall: ${result.isPaywall}`);
    console.log(`  Title: ${result.pageTitle}`);
  }

  console.log('\nCapturing screenshot of example.com...');
  await captureScreenshot(defaultBrowserProvider, 'https://www.example.com', 'test-ts-screenshot.png', 15);

  await defaultBrowserProvider.close();
  console.log('Done.');
}

main().catch(console.error);
