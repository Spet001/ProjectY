import { createOcgcoreWrapper, ZipScriptReader, SqljsCardReader } from 'koishipro-core.js';
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

// Polyfill Node globals for Emscripten ESM bundle when running in Node
if (typeof globalThis.__dirname === 'undefined') {
  (globalThis as any).__dirname = dirname(fileURLToPath(import.meta.url));
}
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = createRequire(import.meta.url);
}

async function main() {
  console.log('Initializing ocgcore wrapper...');
  const wasmPath = resolve('node_modules/koishipro-core.js/dist/vendor/wasm_esm/libocgcore.wasm');
  const wasmBinary = readFileSync(wasmPath);
  const wrapper = await createOcgcoreWrapper({ wasmBinary });
  console.log('Ocgcore wrapper initialized!');

  console.log('Loading script.zip...');
  const zipBytes = readFileSync(resolve('public/data/script.zip'));
  const scriptReader = await ZipScriptReader(zipBytes);
  wrapper.setScriptReader(scriptReader, true);
  console.log('Script reader configured!');

  console.log('Loading cards.cdb...');
  const SQL = await initSqlJs();
  const cdbBytes = readFileSync(resolve('public/data/locales/en-US/cards.cdb'));
  const db = new SQL.Database(cdbBytes);
  wrapper.setCardReader(SqljsCardReader(db), true);
  console.log('Card reader configured!');

  console.log('Creating duel...');
  const duel = wrapper.createDuel(12345);
  duel.setPlayerInfo({ player: 0, lp: 8000, startHand: 5, drawCount: 1 });
  duel.setPlayerInfo({ player: 1, lp: 8000, startHand: 5, drawCount: 1 });

  // Add Blue-Eyes to player 0 hand, deck
  duel.newCard({
    code: 89631139,
    owner: 0,
    player: 0,
    location: 0x01, // DECK
    sequence: 0,
    position: 0x01, // POS_FACEUP_ATTACK
  });
  duel.newCard({
    code: 89631139,
    owner: 0,
    player: 0,
    location: 0x02, // HAND
    sequence: 0,
    position: 0x01,
  });

  // Add Dark Magician to player 1
  duel.newCard({
    code: 46986414,
    owner: 1,
    player: 1,
    location: 0x01,
    sequence: 0,
    position: 0x01,
  });

  console.log('Starting duel...');
  duel.startDuel(0);

  console.log('Processing first step...');
  const res = duel.process();
  console.log('Process result status:', res.status);
  console.log('Raw length:', res.raw?.length);
  console.log('Messages parsed count:', res.messages?.length);
  if (res.messages) {
    for (const msg of res.messages) {
      console.log(' - Message:', msg.constructor.name, (msg as any).identifier);
    }
  }

  duel.endDuel();
  wrapper.finalize();
  console.log('Duel ended successfully!');
}

main().catch(console.error);
