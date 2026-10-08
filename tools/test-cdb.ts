import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function test() {
  const SQL = await initSqlJs();
  const cdbBuffer = readFileSync(resolve('public/data/locales/en-US/cards.cdb'));
  const db = new SQL.Database(cdbBuffer);

  const res = db.exec("SELECT d.id, t.name, d.type, d.atk, d.def, d.level, d.race, d.attribute, t.desc FROM datas d JOIN texts t ON d.id = t.id WHERE d.id = 89631139");
  console.log('Blue-Eyes query result:', JSON.stringify(res, null, 2));
}

test().catch(console.error);
