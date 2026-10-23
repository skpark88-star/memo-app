// Run with Playwright available: node swipe.browser.test.cjs
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(`${__dirname}/index.html`));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      serviceWorkers: 'block',
      permissions: ['clipboard-read', 'clipboard-write'],
    });
    const page = await context.newPage();
    await page.goto(process.env.TEST_URL || `http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      localStorage.setItem('memo_app_links', JSON.stringify(['https://example.com']));
      localStorage.setItem('memo_app_todos', JSON.stringify(
        Array.from({ length: 25 }, (_, i) => ({ text: `Task ${i + 1}`, done: false }))));
      localStorage.setItem('memo_app_tab', 'links');
    });
    await page.reload();
    const cdp = await context.newCDPSession(page);
    async function swipe(selector, dx, dy = 0) {
      const box = await page.locator(selector).first().boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: x + dx * i / 8, y: y + dy * i / 8 }],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    const active = () => page.locator('.tab.active').getAttribute('data-tab');
    await swipe('.link-text', -120);
    assert.equal(await active(), 'todos', 'Swipe starting on link text must switch tabs');
    await swipe('.todo-text', 120);
    assert.equal(await active(), 'links', 'Swipe starting on todo text must switch tabs');
    await page.waitForTimeout(600);
    await page.locator('.link-text').tap();
    await page.waitForFunction(() => document.querySelector('.toast').textContent === '링크 복사됨');
    await page.locator('[data-tab="todos"]').tap();
    await swipe('.todo-text', 0, 200);
    assert.equal(await active(), 'todos', 'Vertical swipe must not switch tabs');
    await swipe('.drag-handle', 0, 140);
    const todos = await page.evaluate(() => JSON.parse(localStorage.getItem('memo_app_todos')));
    assert.notEqual(todos[0].text, 'Task 1', 'Reorder handle must still move tasks');
    await page.evaluate(() => { localStorage.setItem('memo_app_links', '[]'); });
    await page.reload();
    await page.locator('[data-tab="links"]').tap();
    await swipe('.empty-hint', -120);
    assert.equal(await active(), 'todos', 'Empty list must support swiping');
    console.log('PASS: real browser touch swipes on links, todos and empty list; tap-to-copy; vertical gesture; reordering');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
