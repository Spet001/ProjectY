import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9335;

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--window-size=1920,1080',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:5173#duel'
]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  await wait(3000);
  const targets = await getJson('/json/list');
  const target = targets.find((t) => t.url.includes('5173'));

  if (!target) {
    console.error('No localhost:5173 target found');
    chrome.kill();
    return;
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  ws.addEventListener('open', async () => {
    await send('Runtime.enable');
    await wait(2000);

    // Click Commence Duel
    console.log('Clicking Commence Duel...');
    const clickRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('select-player-deck');
        if (sel) {
          for (let opt of sel.options) {
            if (opt.value.includes('Tearlaments')) {
              sel.value = opt.value;
              break;
            }
          }
        }
        const btn = document.getElementById('btn-start-duel-now');
        if (btn) {
          btn.click();
          return 'Clicked start duel now';
        }
        return 'Button not found';
      })()`,
      returnByValue: true
    });
    console.log('Commence result:', clickRes.result?.value);

    // Wait for WASM + Three.js to initialize and draw cards
    await wait(4500);

    // Check game state & inspect first card
    const state = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('.prompt-option-btn'));
        return {
          p0: document.getElementById('p0-name')?.textContent,
          p1: document.getElementById('p1-name')?.textContent,
          turn: document.getElementById('turn-badge')?.textContent,
          inspectMeta: document.getElementById('inspect-meta')?.textContent,
          inspectName: document.getElementById('inspect-name')?.textContent,
          buttons: btns.map(b => b.textContent)
        };
      })()`,
      returnByValue: true
    });
    console.log('Game state:', state.result?.value);

    // Capture Turn 1 duel state
    const ss1 = await send('Page.captureScreenshot', { format: 'png' });
    if (ss1.result && ss1.result.data) {
      fs.writeFileSync('tools/duel_turn1_verified.png', Buffer.from(ss1.result.data, 'base64'));
      console.log('Saved tools/duel_turn1_verified.png');
    }

    // Now let's click the first available action (Normal Summon or Activate)
    const actionRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('.prompt-option-btn'));
        const targetBtn = btns.find(b => b.textContent.includes('Normal Summon') || b.textContent.includes('Activate') || b.textContent.includes('Set'));
        if (targetBtn) {
          targetBtn.click();
          return 'Triggered action: ' + targetBtn.textContent;
        }
        return 'No card actions found';
      })()`,
      returnByValue: true
    });
    console.log('Action performed:', actionRes.result?.value);

    // Wait for card placement animation
    await wait(3000);

    // Capture post-action duel state
    const ss2 = await send('Page.captureScreenshot', { format: 'png' });
    if (ss2.result && ss2.result.data) {
      fs.writeFileSync('tools/duel_action_verified.png', Buffer.from(ss2.result.data, 'base64'));
      console.log('Saved tools/duel_action_verified.png');
    }

    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  chrome.kill();
  process.exit(1);
});
