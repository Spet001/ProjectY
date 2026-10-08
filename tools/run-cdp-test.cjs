const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/josem/.gemini/antigravity/brain/4da156ef-7d2b-4566-864d-2d35b4dd067b';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const os = require('os');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('Spawning Chrome...');
  const tmpDir = path.join(os.tmpdir(), 'chrome-test-' + Date.now());
  const chromeProc = spawn(CHROME_PATH, [
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9225',
    `--user-data-dir=${tmpDir}`,
    '--window-size=1280,720',
    'about:blank',
  ]);

  await wait(2000);

  // Get WebSocket debugger URL
  let targetWsUrl = '';
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9225/json/new', { method: 'PUT' });
      const data = await res.json();
      targetWsUrl = data.webSocketDebuggerUrl;
      if (targetWsUrl) break;
    } catch {
      await wait(500);
    }
  }

  if (!targetWsUrl) {
    throw new Error('Failed to obtain Chrome WebSocket debugger URL');
  }

  console.log('Connecting CDP to:', targetWsUrl);
  const ws = new WebSocket(targetWsUrl);

  let idCounter = 1;
  const callbacks = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails);
    }
    if (msg.id && callbacks.has(msg.id)) {
      const cb = callbacks.get(msg.id);
      callbacks.delete(msg.id);
      if (msg.error) cb.reject(msg.error);
      else cb.resolve(msg.result);
    }
  };

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      callbacks.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  }

  async function captureScreenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buf);
    console.log(`Saved screenshot: ${outPath} (${buf.length} bytes)`);
  }

  try {
    await send('Page.enable');
    await send('Runtime.enable');

    console.log('Navigating to http://localhost:5173...');
    await send('Page.navigate', { url: 'http://localhost:5173' });

    console.log('Waiting for Main Menu to be ready...');
    await evaluate(`new Promise((resolve) => {
      const check = () => {
        const btn = document.querySelector('.mdpro-nav-item[data-action="solo"]');
        if (btn) resolve(true);
        else setTimeout(check, 250);
      };
      check();
    })`);
    await wait(1000);

    // 1. Screenshot of Main Menu
    console.log('Capturing Main Menu...');
    await captureScreenshot('verify_menu.png');

    // 2. Click SOLO menu item to open duel setup modal
    console.log('Clicking SOLO menu item...');
    await evaluate(`(() => {
      const soloBtn = document.querySelector('.mdpro-nav-item[data-action="solo"]');
      if (soloBtn) soloBtn.click();
    })()`);

    console.log('Waiting for duel setup modal...');
    await evaluate(`new Promise((resolve) => {
      const check = () => {
        const btn = document.getElementById('btn-start-duel-now');
        if (btn) resolve(true);
        else setTimeout(check, 200);
      };
      check();
    })`);
    await wait(600);
    await captureScreenshot('verify_duel_modal.png');

    // 3. Click Start Duel in modal
    console.log('Clicking Start Duel (btn-start-duel-now)...');
    await evaluate(`(() => {
      const startBtn = document.getElementById('btn-start-duel-now');
      if (startBtn) startBtn.click();
    })()`);

    // Wait for 3D board to load and game to start turn 1
    console.log('Waiting for duel to initialize...');
    await evaluate(`new Promise((resolve) => {
      const check = () => {
        if (window.__board && window.__board.getCards().length > 0) resolve(true);
        else setTimeout(check, 300);
      };
      check();
    })`);
    await wait(2000);
    await captureScreenshot('verify_duel_turn1.png');

    // 4. Click a card in player hand (controller 0, location 2)
    console.log('Clicking a card in hand...');
    const clickedCard = await evaluate(`(() => {
      if (!window.__board || !window.__handleCardClick) return 'no hooks';
      const handCards = window.__board.getCards().filter(c => c.controller === 0 && c.location === 2);
      if (handCards.length === 0) return 'no hand cards';
      // Find a card that is selectable
      const target = handCards.find(c => c.isSelectable) || handCards[0];
      window.__handleCardClick(target);
      return 'clicked: ' + target.code;
    })()`);
    console.log('Card click result:', clickedCard);
    await wait(800);
    await captureScreenshot('verify_duel_card_selected.png');

    // 5. If circular action button appears, click it!
    console.log('Checking for circular action buttons...');
    const hasPopover = await evaluate(`(() => {
      const pop = document.getElementById('card-action-popover');
      return pop && !pop.classList.contains('hidden') && pop.querySelectorAll('.md-action-circle-btn').length > 0;
    })()`);
    console.log('Has action popover:', hasPopover);

    if (hasPopover) {
      await evaluate(`(() => {
        const btn = document.querySelector('.md-action-circle-btn:not(.cancel)');
        if (btn) btn.click();
      })()`);
      await wait(1500);
      await captureScreenshot('verify_after_action.png');

      // Click zone sequence if prompted
      console.log('Selecting zone...');
      await evaluate(`(() => {
        const zoneBtn = Array.from(document.querySelectorAll('.prompt-option-btn')).find(b => b.textContent.includes('Zone Sequence'));
        if (zoneBtn) zoneBtn.click();
      })()`);
      await wait(2000);
      await captureScreenshot('verify_card_on_field.png');
    }

  } finally {
    ws.close();
    chromeProc.kill();
  }
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
