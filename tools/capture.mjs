import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--window-size=1920,1080',
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
    await wait(3500);
    
    // 1. Capture initial interactive turn 1 frame
    const ss1 = await send('Page.captureScreenshot', { format: 'png' });
    if (ss1.result && ss1.result.data) {
      fs.writeFileSync('tools/capture_turn1_1080p.png', Buffer.from(ss1.result.data, 'base64'));
      console.log('Saved tools/capture_turn1_1080p.png');
    }

    // 2. Click Auto Play to see AI duel in motion
    console.log('Activating Auto Play...');
    await send('Runtime.evaluate', {
      expression: `document.getElementById('btn-auto-play').click()`
    });

    for (let i = 0; i < 6; i++) {
      await wait(1200);
      const st = await send('Runtime.evaluate', {
        expression: `({
          turn: document.getElementById('turn-badge')?.textContent,
          p0Lp: document.getElementById('p0-lp')?.textContent,
          p1Lp: document.getElementById('p1-lp')?.textContent,
          logs: Array.from(document.querySelectorAll('.log-entry')).slice(-2).map(e => e.textContent)
        })`,
        returnByValue: true
      });
      console.log(`[Auto Step ${i+1}]`, st.result?.value);
    }

    // 3. Capture animated duel in progress
    const ss2 = await send('Page.captureScreenshot', { format: 'png' });
    if (ss2.result && ss2.result.data) {
      fs.writeFileSync('tools/capture_autoplay_1080p.png', Buffer.from(ss2.result.data, 'base64'));
      console.log('Saved tools/capture_autoplay_1080p.png');
    }
    
    ws.close();
    chrome.kill();
    process.exit(0);
  });
}

main().catch(err => {
  console.error(err);
  chrome.kill();
  process.exit(1);
});
