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

if (typeof globalThis.__dirname === 'undefined') {
  (globalThis as any).__dirname = dirname(fileURLToPath(import.meta.url));
}
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = createRequire(import.meta.url);
}

async function runVerbose() {
  const wasmBinary = readFileSync(resolve('node_modules/koishipro-core.js/dist/vendor/wasm_esm/libocgcore.wasm'));
  const wrapper = await createOcgcoreWrapper({ wasmBinary });
  wrapper.setScriptReader(await ZipScriptReader(readFileSync(resolve('public/data/script.zip'))), true);

  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(resolve('public/data/locales/en-US/cards.cdb')));
  wrapper.setCardReader(SqljsCardReader(db), true);
  const cardDb = new CardDatabase(db);

  const deck1 = parseYdk(readFileSync(resolve('public/data/decks/AI_BlueEyes.ydk'), 'utf-8'));
  const deck2 = parseYdk(readFileSync(resolve('public/data/decks/AI_DarkMagician.ydk'), 'utf-8'));

  const runner = new DuelRunner({
    wrapper,
    cardDb,
    player0Deck: deck1,
    player1Deck: deck2,
    isPlayer0Bot: true,
    isPlayer1Bot: true,
  });

  runner.on((e) => {
    if (e.type === 'log') console.log('  ' + e.text);
  });

  for (let i = 1; i <= 60; i++) {
    const res = await runner.step();
    const msgNames = res.messages.map((m) => m.constructor.name).join(', ') || 'none';
    console.log(`[Step ${i}] msgs: ${msgNames}`);
    if (runner.isEnded) break;
  }

  runner.destroy();
  wrapper.finalize();
}

runVerbose().catch(console.error);
