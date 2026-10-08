import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9222;

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--remote-allow-origins=*',
  '--user-data-dir=C:\\Users\\josem\\AppData\\Local\\Temp\\chrome-mdpro-test',
  `--remote-debugging-port=${port}`,
  'http://localhost:5173',
]);

async function run() {
  try {
    let list = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        if (res.ok) {
          list = await res.json();
          if (list && list.length > 0) break;
        }
      } catch {}
    }

    if (!list || list.length === 0) {
      throw new Error('Could not connect to Chrome debugging port');
    }

    console.log('Pages detected:', list.length);
    const page = list.find((p) => p.type === 'page') || list[0];
    if (!page) throw new Error('No page found');

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => {
      ws.onopen = resolve;
    });

    let id = 1;
    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const msgId = id++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === msgId) {
            ws.removeEventListener('message', handler);
            resolve(data.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    // Capture console messages
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('[BROWSER CONSOLE]', data.params.type, data.params.args.map((a) => a.value || a.description).join(' '));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        console.error('[BROWSER EXCEPTION]', data.params.exceptionDetails);
      }
    });

    await send('Runtime.enable');
    await send('Page.enable');

    // Wait 3.5 seconds for wasm, sqlite, and menu to render
    await new Promise((r) => setTimeout(r, 3500));

    // Evaluate DOM state
    const evalRes = await send('Runtime.evaluate', {
      expression: `({
        title: document.title,
        hasMenu: !!document.querySelector('.main-menu-screen'),
        hasHubCards: document.querySelectorAll('.hub-card').length,
        hasGlobalError: !!document.body.innerText.includes('GLOBAL ERROR'),
        userName: document.querySelector('.user-name')?.innerText,
        logo: document.querySelector('.game-logo-text')?.innerText,
      })`,
      returnByValue: true,
    });
    console.log('DOM Evaluation Result:', evalRes.result.value);

    // Capture Screenshot
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) {
      writeFileSync('menu_screenshot.png', Buffer.from(shot.data, 'base64'));
      writeFileSync('C:\\Users\\josem\\.gemini\\antigravity\\brain\\4da156ef-7d2b-4566-864d-2d35b4dd067b\\menu_screenshot.png', Buffer.from(shot.data, 'base64'));
      console.log('Saved screenshot successfully!');
    }

    ws.close();
  } catch (e) {
    console.error('Error running CDP test:', e);
  } finally {
    chrome.kill();
  }
}

run();
