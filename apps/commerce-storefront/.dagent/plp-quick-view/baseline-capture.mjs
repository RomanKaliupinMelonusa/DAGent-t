import { chromium } from 'playwright';

const targets = [
  { name: "PLP-Dresses", url: "/category/womens-clothing-dresses", kind: "page" },
  { name: "PLP-NewArrivals", url: "/category/newarrivals", kind: "page" },
];

const BASE = "http://localhost:3000";
const consoleErrors = [];
const networkFailures = [];
const uncaughtExceptions = [];

async function capturePage(browser, target) {
  const context = await browser.newContext();
  const page = await context.newPage();

  const localConsole = [];
  const localNetwork = [];
  const localUncaught = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      localConsole.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    localUncaught.push(err.message || String(err));
  });

  page.on('requestfailed', req => {
    const failure = req.failure();
    localNetwork.push({
      url: req.url(),
      method: req.method(),
      error: failure ? failure.errorText : 'unknown'
    });
  });

  try {
    console.error(`Navigating to ${target.url}...`);
    await page.goto(BASE + target.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(2000);
    console.error(`  Console errors: ${localConsole.length}`);
    console.error(`  Network failures: ${localNetwork.length}`);
    console.error(`  Uncaught exceptions: ${localUncaught.length}`);
  } catch (e) {
    console.error(`  Navigation error: ${e.message}`);
  }

  for (const msg of localConsole) {
    consoleErrors.push({ message: msg, source_page: target.name });
  }
  for (const nf of localNetwork) {
    networkFailures.push({ ...nf, source_page: target.name });
  }
  for (const ue of localUncaught) {
    uncaughtExceptions.push({ message: ue, source_page: target.name });
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const target of targets) {
    await capturePage(browser, target);
  }

  await browser.close();

  const result = {
    consoleErrors,
    networkFailures,
    uncaughtExceptions,
    targets
  };

  console.log(JSON.stringify(result));
})();
