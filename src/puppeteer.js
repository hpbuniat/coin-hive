const EventEmitter = require('events');
const puppeteer = require('puppeteer');

class Puppeteer extends EventEmitter {

  constructor({ siteKey, interval, host, port, server, threads, proxy, chromePath, username, url }) {
    super();
    this.inited = false;
    this.dead = false;
    this.host = host;
    this.port = port;
    this.server = server;
    this.browser = null;
    this.page = null;
    this.proxy = proxy;
    this.chromePath = chromePath;
    this.url = url;
    this.options = { siteKey, interval, threads, username };
  }

  async isBrowserAvailable(browser) {
    try {
        await browser.version();
    } catch (e) {
        console.log('Error checking browser', e); // not opened etc.
        return false;
    }

    return true;
  }

  async getBrowser() {
    if (this.browser) {
      return this.browser;
    }

    const DEFAULT_ARGS = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--single-process',
        '--no-zygote',
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        '--enable-logging',
        '--log-level=0',
        '--v=99',
        '--user-data-dir=/tmp/user-data',
        '--data-path=/tmp/data-path',
        '--homedir=/tmp',
        '--disk-cache-dir=/tmp/cache-dir'
    ];

    let options = {
        args: this.proxy ? ['--proxy-server=' + this.proxy].concat(DEFAULT_ARGS) : DEFAULT_ARGS
    };

    if (!!this.chromePath) {
      options.executablePath = this.chromePath;
      options.headless = true;
      options.dumpio = true;
    }

    if (!this.browser || !await this.isBrowserAvailable(this.browser)) {
        this.browser = await puppeteer.launch(options);
    }

    return this.browser;
  }

  async getPage() {
    if (this.page) {
      return this.page;
    }

    const browser = await this.getBrowser();
    this.page = await browser.newPage();
    return this.page;
  }

  async init() {

    if (this.dead) {
      throw new Error('This miner has been killed');
    }

    if (this.inited) {
      return this.page;
    }

    const page = await this.getPage();
    const url = process.env.COINHIVE_PUPPETEER_URL || this.url || `http://${this.host}:${this.port}`;
    await page.goto(url);
    await page.exposeFunction('emitMessage', (event, message) => this.emit(event, message));
    await page.exposeFunction('update', (data, interval) => this.emit('update', data, interval));
    await page.evaluate(({ siteKey, interval, threads, username }) => window.init({ siteKey, interval, threads, username }), this.options);

    this.inited = true;

    return this.page;
  }

  async start() {
    await this.init();
    return this.page.evaluate(() => window.start());
  }

  async stop() {
    await this.init();
    return this.page.evaluate(() => window.stop());
  }

  async kill() {
    this.on('error', () => { })
    try {
      await this.stop();
    } catch (e) { console.log('Error stopping miner', e) }
    try {
      const browser = await this.getBrowser();
      await browser.close();
    } catch (e) { console.log('Error closing browser', e) }
    try {
      if (this.server) {
        this.server.close();
      }
    } catch (e) { console.log('Error closing server', e) }
    this.dead = true;
  }

  async rpc(method, args) {
    await this.init();
    return this.page.evaluate((method, args) => window.miner[method].apply(window.miner, args), method, args)
  }
}

module.exports = function getPuppeteer(options = {}) {
  return new Puppeteer(options);
}
