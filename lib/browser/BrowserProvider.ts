import { chromium, Browser } from 'playwright';
import * as net from 'net';

export class BrowserProvider {
  private cdpPort: number;
  private connectionTimeout: number;
  private browser: Browser | null = null;
  private initialized = false;
  private usingRealChrome = false;
  private lock: Promise<void> | null = null;

  constructor(cdpPort = 9222, connectionTimeoutMs = 30000) {
    this.cdpPort = cdpPort;
    this.connectionTimeout = connectionTimeoutMs;
  }

  get isUsingRealChrome() {
    return this.initialized && this.usingRealChrome;
  }

  get isAvailable() {
    return this.browser !== null && this.browser.isConnected();
  }

  async getBrowser(): Promise<Browser | null> {
    if (this.initialized && this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    while (this.lock) {
      await this.lock;
      if (this.initialized && this.browser && this.browser.isConnected()) {
        return this.browser;
      }
    }

    let resolveLock!: () => void;
    this.lock = new Promise((resolve) => {
      resolveLock = resolve;
    });

    try {
      if (this.initialized) {
        await this.cleanup();
        this.initialized = false;
      }

      if (await this.isPortOpen()) {
        try {
          this.browser = await chromium.connectOverCDP(`http://localhost:${this.cdpPort}`, {
            timeout: this.connectionTimeout,
          });
          this.usingRealChrome = true;
          this.initialized = true;
          console.log(`Connected to Chrome via CDP (port ${this.cdpPort})`);
          return this.browser;
        } catch (e) {
          console.log(`CDP connection failed:`, e);
        }
      }

      try {
        this.browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-http2',
            '--disable-blink-features=AutomationControlled'
          ]
        });
        this.usingRealChrome = false;
        this.initialized = true;
        console.log('Launched Playwright Chromium (fallback)');
        return this.browser;
      } catch (e) {
        console.log('Fallback launch failed:', e);
        return null;
      }
    } finally {
      this.lock = null;
      resolveLock();
    }
  }

  private isPortOpen(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(2000);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        resolve(false);
      });
      socket.connect(this.cdpPort, '127.0.0.1');
    });
  }

  private async cleanup() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        // ignore
      }
      this.browser = null;
    }
  }

  async close() {
    await this.cleanup();
    this.initialized = false;
  }
}

export const defaultBrowserProvider = new BrowserProvider();
