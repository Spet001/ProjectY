// Copia os dados de jogo do MDPro3 (cards.cdb, script.zip, strings, lflist, decks)
// para public/data. Uso: npm run setup:data -- [caminho do MDPro3]
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const mdpro = resolve(process.argv[2] ?? 'D:/MDPro3-master/MDPro3-master');
const src = join(mdpro, 'Data');
const dst = resolve('public/data');

if (!existsSync(src)) {
  console.error(`Pasta Data não encontrada em ${src}`);
  process.exit(1);
}

mkdirSync(dst, { recursive: true });

const files = ['script.zip', 'lflist.conf'];
for (const f of files) {
  cpSync(join(src, f), join(dst, f));
  console.log('ok', f);
}

// Locales: só o necessário para o cliente (cdb + strings)
for (const loc of readdirSync(join(src, 'locales'))) {
  const from = join(src, 'locales', loc);
  const to = join(dst, 'locales', loc);
  mkdirSync(to, { recursive: true });
  for (const f of ['cards.cdb', 'strings.conf']) {
    if (existsSync(join(from, f))) cpSync(join(from, f), join(to, f));
  }
  console.log('ok locale', loc);
}

cpSync(join(src, 'Windbot', 'Decks'), join(dst, 'decks'), { recursive: true });
console.log('ok decks');
console.log(`\nDados copiados para ${dst}`);
