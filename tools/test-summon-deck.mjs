import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9338;

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

    // Select SnakeEye deck
    console.log('Selecting AI_SnakeEye and starting duel...');
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('select-player-deck');
        if (sel) {
          for (let opt of sel.options) {
            if (opt.value.includes('SnakeEye')) {
              sel.value = opt.value;
              break;
            }
          }
        }
        document.getElementById('btn-start-duel-now')?.click();
      })()`
    });

    await wait(4500);

    // Look for Normal Summon button and click it
    const promptCheck = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('.prompt-option-btn'));
        const normalSummonBtn = btns.find(b => b.textContent.includes('Normal Summon'));
        if (normalSummonBtn) {
          normalSummonBtn.click();
          return 'Successfully clicked Normal Summon: ' + normalSummonBtn.textContent;
        }
        return 'Buttons: ' + btns.map(b => b.textContent).join(' | ');
      })()`,
      returnByValue: true
    });
    console.log('Prompt action check:', promptCheck.result?.result?.value ?? promptCheck.result);

    await wait(3000);

    const ss = await send('Page.captureScreenshot', { format: 'png' });
    if (ss.result && ss.result.data) {
      fs.writeFileSync('tools/duel_snakeeye_summon.png', Buffer.from(ss.result.data, 'base64'));
      console.log('Saved tools/duel_snakeeye_summon.png');
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
