// Plugin do Vite: serve /pics/<id>.jpg, /texture/*, /icon/*, /sound/*, /data/* e API de customização/decks a partir do workspace
import type { Plugin } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { zipSync } from 'fflate';

const USER_DIRS = ['public/pics', 'public/pics/art'];
const CACHE_DIR = resolve('.cache/pics');
const SCRIPT_ZIP_CACHE = resolve('.cache/script.zip');
const REMOTE = (id: string) => `https://images.ygoprodeck.com/images/cards_cropped/${id}.jpg`;

// Fila simples para respeitar o limite de requisições do YGOPRODeck
let active = 0;
const queue: (() => void)[] = [];
const MAX_CONCURRENT = 4;
async function throttled<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    queue.shift()?.();
  }
}

const pending = new Map<string, Promise<Buffer | null>>();

function fetchRemote(id: string): Promise<Buffer | null> {
  let p = pending.get(id);
  if (!p) {
    p = throttled(async () => {
      const res = await fetch(REMOTE(id));
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(join(CACHE_DIR, `${id}.jpg`), buf);
      return buf;
    }).finally(() => pending.delete(id));
    pending.set(id, p);
  }
  return p;
}

function getOrBuildScriptZip(): Buffer | null {
  if (existsSync(SCRIPT_ZIP_CACHE)) {
    return readFileSync(SCRIPT_ZIP_CACHE);
  }
  const scriptDir = resolve('data/script');
  if (!existsSync(scriptDir)) return null;

  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(scriptDir)) {
    if (name.endsWith('.lua')) {
      const full = join(scriptDir, name);
      if (statSync(full).isFile()) {
        files[`script/${name}`] = new Uint8Array(readFileSync(full));
      }
    }
  }
  const zipped = Buffer.from(zipSync(files, { level: 1 }));
  mkdirSync(resolve('.cache'), { recursive: true });
  writeFileSync(SCRIPT_ZIP_CACHE, zipped);
  return zipped;
}

const SOUND_DIRS = [
  'assets/Sound/BGM',
  'assets/Sound/SE_DUEL',
  'assets/Sound/SE_SYS',
  'assets/Sound/SE_FIELD',
  'assets/Sound/SE_MATE',
  'assets/Sound/SE_CrossDuel',
  'assets/Sound',
];

const ICON_DIRS = [
  'assets/Icon',
  'assets/Icon/ProfileIcon/HD',
  'assets/Icon/ProfileIcon',
  'assets/Icon/ProfileFrame/HD',
  'assets/Icon/ProfileFrame',
  'assets/Icon/AvatarBase/HD',
  'assets/Icon/AvatarBase',
  'assets/Icon/Field/HD',
  'assets/Icon/Field',
  'assets/Icon/Mate',
  'assets/Icon/Wallpaper',
  'assets/Icon/DeckCase/HD',
  'assets/Icon/DeckCase',
  'assets/Icon/Grave/HD',
  'assets/Icon/Grave',
];

const TEXTURE_DIRS = [
  'assets/Texture',
  'assets/Texture/CardFrames/OCG_Frames',
  'assets/Texture/CardFrames/OCG_Loading',
  'assets/Texture/CardFrames/OCG_Masks',
  'assets/Texture/CardFrames/RushDuel',
  'assets/Texture/Texture_Other',
  'assets/Texture/Other',
  'assets/Texture/GUI',
  'assets/Texture/GUI_Used',
  'assets/Texture/Icons_DuelButton',
  'assets/Texture/Icons_Attribute',
  'assets/Texture/Icons_CardLlist',
  'assets/Texture/Icons_Counter',
  'assets/Texture/Icons_Gamepad',
  'assets/Texture/Icons_Numbers',
  'assets/Texture/Icons_Race',
  'assets/Texture/Icons_Rank',
  'assets/Texture/Icons_Rarity',
  'assets/Texture/Icons_State',
  'assets/Texture/Icons_Types',
  'assets/Texture/LinkMarkers',
  'assets/Texture/MenuIcon',
];

const DECK_DIRS = [
  'data/Windbot/Decks',
];

export function artProxyPlugin(): Plugin {
  const middleware = async (req: any, res: any, next: () => void) => {
    // API: Get customization items
    if (req.url === '/api/customization') {
      res.setHeader('Content-Type', 'application/json');
      const icons: string[] = [];
      const frames: string[] = [];
      const mates: string[] = [];
      const fields: string[] = [];
      const wallpapers: string[] = [];
      const deckCases: string[] = [];
      const bgmTracks: string[] = [];
      const protectors: string[] = ['DefaultProtector.png', 'classic'];

      const profileIconDir = resolve('assets/Icon/ProfileIcon/HD');
      if (existsSync(profileIconDir)) {
        icons.push(...readdirSync(profileIconDir).filter((f) => f.endsWith('.png')).slice(0, 60));
      }

      const frameDir = resolve('assets/Icon/ProfileFrame/HD');
      if (existsSync(frameDir)) {
        frames.push(...readdirSync(frameDir).filter((f) => f.endsWith('.png')).slice(0, 40));
      }

      const mateDir = resolve('assets/Icon/Mate');
      if (existsSync(mateDir)) {
        mates.push(...readdirSync(mateDir).filter((f) => f.endsWith('.png')).slice(0, 60));
      }

      const fieldDir = resolve('assets/Icon/Field/HD');
      if (existsSync(fieldDir)) {
        fields.push(...readdirSync(fieldDir).filter((f) => f.endsWith('.png')).slice(0, 50));
      }

      const wallpaperDir = resolve('assets/Icon/Wallpaper');
      if (existsSync(wallpaperDir)) {
        wallpapers.push(...readdirSync(wallpaperDir).filter((f) => f.endsWith('.png')).slice(0, 40));
      }

      const deckCaseDir = resolve('assets/Icon/DeckCase/HD');
      if (existsSync(deckCaseDir)) {
        deckCases.push(
          ...readdirSync(deckCaseDir)
            .filter((f) => f.endsWith('_L.png') && !f.includes('Open') && !f.includes('reverse'))
            .slice(0, 60)
        );
      }

      const bgmDir = resolve('assets/Sound/BGM');
      if (existsSync(bgmDir)) {
        bgmTracks.push(...readdirSync(bgmDir).filter((f) => f.endsWith('.ogg')));
      }

      res.end(JSON.stringify({ icons, frames, mates, fields, wallpapers, deckCases, bgmTracks, protectors }));
      return;
    }

    // API: Get deck list
    if (req.url === '/api/decks') {
      res.setHeader('Content-Type', 'application/json');
      const deckMap: Record<string, string> = {};
      for (const dDir of DECK_DIRS) {
        const p = resolve(dDir);
        if (existsSync(p)) {
          for (const f of readdirSync(p)) {
            if (f.endsWith('.ydk') && !deckMap[f]) {
              try {
                deckMap[f] = readFileSync(resolve(p, f), 'utf-8');
              } catch {}
            }
          }
        }
      }
      res.end(JSON.stringify(deckMap));
      return;
    }

    // 0. Workspace /data/* handler
    const dm = req.url?.match(/^\/data\/(.+)$/);
    if (dm) {
      const rawRel = decodeURIComponent(dm[1].split('?')[0]);
      if (rawRel === 'script.zip') {
        const zipBuf = getOrBuildScriptZip();
        if (zipBuf) {
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Cache-Control', 'public, max-age=604800');
          res.end(zipBuf);
          return;
        }
      }

      const candidates = [
        resolve('data', rawRel),
        rawRel.startsWith('decks/')
          ? resolve('data/Windbot/Decks', rawRel.slice('decks/'.length))
          : '',
      ].filter(Boolean);

      for (const c of candidates) {
        if (existsSync(c) && statSync(c).isFile()) {
          if (c.endsWith('.cdb')) res.setHeader('Content-Type', 'application/octet-stream');
          else if (c.endsWith('.conf') || c.endsWith('.ydk') || c.endsWith('.lua')) {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          res.setHeader('Cache-Control', 'public, max-age=604800');
          res.end(readFileSync(c));
          return;
        }
      }
      res.statusCode = 404;
      res.end('Data file not found');
      return;
    }

    // 1. Audio files handler: /sound/<name>.ogg
    const sm = req.url?.match(/^\/sound\/(.+)$/);
    if (sm) {
      const rawRel = decodeURIComponent(sm[1].split('?')[0]);
      const basename = rawRel.split('/').pop() || rawRel;
      for (const sDir of SOUND_DIRS) {
        const candidates = [
          resolve(sDir, rawRel),
          resolve(sDir, basename),
          resolve(sDir, `${basename}.ogg`),
        ];
        for (const c of candidates) {
          if (existsSync(c) && statSync(c).isFile()) {
            res.setHeader('Content-Type', 'audio/ogg');
            res.setHeader('Cache-Control', 'public, max-age=604800');
            res.end(readFileSync(c));
            return;
          }
        }
      }
      res.statusCode = 404;
      res.end('Sound not found');
      return;
    }

    // 2. Icon assets handler: /icon/<name>.png
    const im = req.url?.match(/^\/icon\/(.+)$/);
    if (im) {
      const rawRel = decodeURIComponent(im[1].split('?')[0]);
      const basename = rawRel.split('/').pop() || rawRel;
      for (const iDir of ICON_DIRS) {
        const candidates = [
          resolve(iDir, rawRel),
          resolve(iDir, basename),
          resolve(iDir, `${basename}.png`),
        ];
        for (const c of candidates) {
          if (existsSync(c) && statSync(c).isFile()) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=604800');
            res.end(readFileSync(c));
            return;
          }
        }
      }
      res.statusCode = 404;
      res.end('Icon not found');
      return;
    }

    // 3. Texture handler: /texture/<name>.png
    const tm = req.url?.match(/^\/texture\/(.+)$/);
    if (tm) {
      const rawRel = decodeURIComponent(tm[1].split('?')[0]);
      const basename = rawRel.split('/').pop() || rawRel;
      for (const tDir of TEXTURE_DIRS) {
        const candidates = [
          resolve(tDir, rawRel),
          resolve(tDir, basename),
          resolve(tDir, `${basename}.png`),
        ];
        for (const c of candidates) {
          if (existsSync(c) && statSync(c).isFile()) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=604800');
            res.end(readFileSync(c));
            return;
          }
        }
      }
      res.statusCode = 404;
      res.end('Texture not found');
      return;
    }

    // 4. Card art handler: /pics/<id>.(jpg|png)
    const m = req.url?.match(/^\/pics\/(\d+)\.(jpg|png)$/);
    if (!m) return next();
    const id = m[1];
    for (const dir of USER_DIRS) {
      for (const ext of ['jpg', 'png']) {
        const f = resolve(dir, `${id}.${ext}`);
        if (existsSync(f)) {
          res.setHeader('Content-Type', ext === 'png' ? 'image/png' : 'image/jpeg');
          res.end(readFileSync(f));
          return;
        }
      }
    }
    const cached = join(CACHE_DIR, `${id}.jpg`);
    try {
      const buf = existsSync(cached) ? readFileSync(cached) : await fetchRemote(id);
      if (!buf) {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.end(buf);
    } catch (e) {
      res.statusCode = 502;
      res.end(String(e));
    }
  };

  return {
    name: 'mdpro-art-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
