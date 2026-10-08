import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  'http://localhost:5173'
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
  await wait(2500);
  const targets = await getJson('/json/list');
  const target = targets.find(t => t.url.includes('5173'));
  
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
    await wait(3000);
    
    // Click "Auto Play" to let Kaiba AI vs Yugi AI play for 8 seconds
    console.log('Clicking Auto Play...');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-auto-play').click()`
    });
    
    // Let duel play out for 7 seconds
    for (let i = 0; i < 7; i++) {
      await wait(1000);
      const state = await send('Runtime.evaluate', {
        expression: `({
          turn: document.getElementById('turn-badge')?.textContent,
          p0Lp: document.getElementById('p0-lp')?.textContent,
          p1Lp: document.getElementById('p1-lp')?.textContent,
          lastLogs: Array.from(document.querySelectorAll('.log-entry')).slice(-4).map(e => e.textContent)
        })`,
        returnByValue: true
      });
      console.log(`[Turn step +${i+1}s]`, state.result?.value);
    }
    
    const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
    if (screenshotRes.result && screenshotRes.result.data) {
      fs.writeFileSync('tools/duel_play.png', Buffer.from(screenshotRes.result.data, 'base64'));
      console.log('Screenshot saved to tools/duel_play.png');
    }
    
    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Error:', err);
  chrome.kill();
  process.exit(1);
});
