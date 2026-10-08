import { createOcgcoreWrapper, ZipScriptReader, SqljsCardReader } from 'koishipro-core.js';
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

import { parseYdk } from '../src/engine/ydk';
import { CardDatabase } from '../src/engine/card-database';
import { DUEL_RULE_MR5, LOCATION, POS } from '../src/engine/constants';
import { SimpleBot } from '../src/engine/bot/simple-bot';
import { YGOProMsgResponseBase } from 'ygopro-msg-encode';

if (typeof globalThis.__dirname === 'undefined') {
  (globalThis as any).__dirname = dirname(fileURLToPath(import.meta.url));
}
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = createRequire(import.meta.url);
}

async function debugStep() {
  const wasmPath = resolve('node_modules/koishipro-core.js/dist/vendor/wasm_esm/libocgcore.wasm');
  const wasmBinary = readFileSync(wasmPath);
  const wrapper = await createOcgcoreWrapper({ wasmBinary });

  const zipBytes = readFileSync(resolve('public/data/script.zip'));
  wrapper.setScriptReader(await ZipScriptReader(zipBytes), true);

  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(resolve('public/data/locales/en-US/cards.cdb')));
  wrapper.setCardReader(SqljsCardReader(db), true);
  const cardDb = new CardDatabase(db);

  const deck1 = parseYdk(readFileSync(resolve('public/data/decks/AI_BlueEyes.ydk'), 'utf-8'));
  const deck2 = parseYdk(readFileSync(resolve('public/data/decks/AI_DarkMagician.ydk'), 'utf-8'));

  const duel = wrapper.createDuel(12345);
  duel.setPlayerInfo({ player: 0, lp: 8000, startHand: 5, drawCount: 1 });
  duel.setPlayerInfo({ player: 1, lp: 8000, startHand: 5, drawCount: 1 });

  for (let seq = 0; seq < deck1.main.length; seq++) {
    duel.newCard({ code: deck1.main[seq], owner: 0, player: 0, location: LOCATION.DECK, sequence: seq, position: POS.FACEDOWN_ATTACK });
  }
  for (let seq = 0; seq < deck2.main.length; seq++) {
    duel.newCard({ code: deck2.main[seq], owner: 1, player: 1, location: LOCATION.DECK, sequence: seq, position: POS.FACEDOWN_ATTACK });
  }

  duel.startDuel(DUEL_RULE_MR5);

  const bot0 = new SimpleBot(0, cardDb);
  const bot1 = new SimpleBot(1, cardDb);

  for (let i = 0; i < 40; i++) {
    const res = duel.process();
    console.log(`\n--- Iteration ${i} --- status: ${res.status}, msgCount: ${res.messages?.length}`);
    if (res.messages) {
      for (const m of res.messages) {
        console.log(`  Msg: ${m.constructor.name} (isResponse: ${m instanceof YGOProMsgResponseBase})`);
      }
    } else {
      console.log('  Raw bytes (unparsed):', res.raw.length, Buffer.from(res.raw).toString('hex'));
    }
    if (res.status === 1) {
      const prompt = res.messages?.find((m) => m instanceof YGOProMsgResponseBase) as YGOProMsgResponseBase | undefined;
      console.log('  Prompt found:', prompt?.constructor.name, 'player:', prompt?.responsePlayer());
      if (prompt) {
        const bot = prompt.responsePlayer() === 0 ? bot0 : bot1;
        const responseBytes = bot.decide(prompt);
        console.log('  Bot response bytes length:', responseBytes?.length, Buffer.from(responseBytes));
        duel.setResponse(responseBytes);
      }
    }
    if (res.status === 2) {
      console.log('  Duel reached status 2 (ended)');
      break;
    }
  }

  duel.endDuel();
  wrapper.finalize();
}

debugStep().catch(console.error);
