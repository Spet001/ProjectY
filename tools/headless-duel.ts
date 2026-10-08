import { createOcgcoreWrapper, ZipScriptReader, SqljsCardReader } from 'koishipro-core.js';
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

import { parseYdk } from '../src/engine/ydk';
import { CardDatabase } from '../src/engine/card-database';
import { DuelRunner } from '../src/engine/duel-runner';

// Node ESM polyfills for Emscripten
if (typeof globalThis.__dirname === 'undefined') {
  (globalThis as any).__dirname = dirname(fileURLToPath(import.meta.url));
}
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = createRequire(import.meta.url);
}

async function runHeadlessDuel() {
  console.log('==================================================');
  console.log('       MDPro Web: Headless Duel Simulation        ');
  console.log('==================================================\n');

  // 1. Initialize WASM ocgcore
  const wasmPath = resolve('node_modules/koishipro-core.js/dist/vendor/wasm_esm/libocgcore.wasm');
  const wasmBinary = readFileSync(wasmPath);
  const wrapper = await createOcgcoreWrapper({ wasmBinary });

  // 2. Load Lua scripts
  const zipBytes = readFileSync(resolve('public/data/script.zip'));
  wrapper.setScriptReader(await ZipScriptReader(zipBytes), true);

  // 3. Load SQLite card database
  const SQL = await initSqlJs();
  const cdbBytes = readFileSync(resolve('public/data/locales/en-US/cards.cdb'));
  const db = new SQL.Database(cdbBytes);
  wrapper.setCardReader(SqljsCardReader(db), true);

  const stringsContent = readFileSync(resolve('public/data/locales/en-US/strings.conf'), 'utf-8');
  const cardDb = new CardDatabase(db, stringsContent);

  // 4. Load Decks
  const deck1Text = readFileSync(resolve('public/data/decks/AI_BlueEyes.ydk'), 'utf-8');
  const deck2Text = readFileSync(resolve('public/data/decks/AI_DarkMagician.ydk'), 'utf-8');

  const deck1 = parseYdk(deck1Text, 'Blue-Eyes Deck');
  const deck2 = parseYdk(deck2Text, 'Dark Magician Deck');

  console.log(`Player 1: Seto Kaiba (AI) [${deck1.name}] - Main: ${deck1.main.length}, Extra: ${deck1.extra.length}`);
  console.log(`Player 2: Yami Yugi (AI) [${deck2.name}] - Main: ${deck2.main.length}, Extra: ${deck2.extra.length}\n`);

  // 5. Create Duel Runner with two AI bots
  const runner = new DuelRunner({
    wrapper,
    cardDb,
    player0Deck: deck1,
    player1Deck: deck2,
    player0Name: 'Seto Kaiba (AI)',
    player1Name: 'Yami Yugi (AI)',
    isPlayer0Bot: true,
    isPlayer1Bot: true,
  });

  runner.on((event) => {
    if (event.type === 'log') {
      console.log(event.text);
    }
  });

  console.log('--- DUEL COMMENCED ---\n');

  const maxSteps = 150;
  let steps = 0;

  while (!runner.isEnded && steps < maxSteps) {
    steps++;
    const res = await runner.step();
    if (res.awaitingHuman) {
      console.log('Paused for human input.');
      break;
    }
  }

  console.log('\n==================================================');
  console.log(`Simulation finished after ${steps} steps!`);
  console.log(`Turn: ${runner.turn}`);
  console.log(`Current LP -> Kaiba: ${runner.lp[0]} | Yugi: ${runner.lp[1]}`);
  console.log(`Duel Ended: ${runner.isEnded ? 'Yes' : 'No'}`);
  if (runner.winner !== null) {
    const winnerName = runner.winner === 2 ? 'Draw' : runner.playerNames[runner.winner];
    console.log(`Winner: ${winnerName}`);
  }
  console.log('==================================================');

  runner.destroy();
  wrapper.finalize();
}

runHeadlessDuel().catch((err) => {
  console.error('Headless duel error:', err);
  process.exit(1);
});
