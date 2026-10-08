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
import { YGOProMsgSelectIdleCmd, IdleCmdType } from 'ygopro-msg-encode';

if (typeof globalThis.__dirname === 'undefined') {
  (globalThis as any).__dirname = dirname(fileURLToPath(import.meta.url));
}
if (typeof globalThis.require === 'undefined') {
  (globalThis as any).require = createRequire(import.meta.url);
}

async function inspectIdle() {
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
    isPlayer0Bot: false, // so it pauses on human prompts
    isPlayer1Bot: true,
  });

  for (let i = 1; i <= 15; i++) {
    const res = await runner.step();
    if (res.awaitingHuman && res.prompt instanceof YGOProMsgSelectIdleCmd) {
      const p = res.prompt;
      console.log(`\n[IdleCmd #${i}] summonable: ${p.summonableCount}, spSummonable: ${p.spSummonableCount}, ssetable: ${p.ssetableCount}, activatable: ${p.activatableCount}, canBp: ${p.canBp}, canEp: ${p.canEp}`);
      if (p.ssetableCount > 0) {
        console.log('  ssetable cards:', p.ssetableCards.map((c) => `${cardDb.getName(c.code)} (loc:${c.location}, seq:${c.sequence})`));
      }
      // respond with End Phase
      if (p.canEp) {
        console.log('  -> Bot decides: TO_EP');
        runner.respond(p.prepareResponse(IdleCmdType.TO_EP));
      } else {
        break;
      }
    } else if (res.awaitingHuman && res.prompt) {
      console.log(`[Non-Idle Prompt #${i}]: ${res.prompt.constructor.name}`);
      runner.respond((res.prompt as any).defaultResponse?.() ?? 0);
    }
  }

  runner.destroy();
  wrapper.finalize();
}

inspectIdle().catch(console.error);
