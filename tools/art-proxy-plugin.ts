// Plugin de dev do Vite: serve /pics/<id>.jpg, /texture/*, /icon/*, /sound/* e API de customização/decks
import type { Plugin } from 'vite';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const USER_DIRS = ['public/pics', 'public/pics/art'];
const CACHE_DIR = resolve('.cache/pics');
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

const SOUND_DIRS = [
  'public/sound',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Sound/BGM',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Sound/SE_DUEL',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Sound/SE_SYS',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Sound/SE_FIELD',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Sound/SE_MATE',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Sound',
  'D:/MDPro3-master/assets/Sound',
];

const ICON_DIRS = [
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/ProfileIcon/HD',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/ProfileFrame/HD',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/ProfileFrame',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/AvatarBase/HD',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Field/HD',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Field',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Mate',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Wallpaper',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/DeckCase/HD',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/DeckCase',
  'D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Grave/HD',
];

const TEXTURE_DIRS = [
  'D:/MDPro3-master/MDPro3-master/Assets/Texture',
  'D:/MDPro3-master/MDPro3-master/Assets/Texture/CardFrames/OCG_Frames',
  'D:/MDPro3-master/MDPro3-master/Assets/Texture/CardFrames/RushDuel',
  'D:/MDPro3-master/MDPro3-master/Assets/Texture/Texture_Other',
  'D:/MDPro3-master/MDPro3-master/Assets/Texture/GUI',
  'D:/MDPro3-master/MDPro3-master/Assets/Texture/GUI_Used',
  'D:/MDPro3-master/MDPro3-master/Assets/Texture/Icons_DuelButton',
  'D:/MDPro3-master/MDPro3-master/Assets/AssetBundles/Duel/BG/Mat/Mat_002/ignoreab/sourceimages',
  'public/textures',
];

const DECK_DIRS = [
  'public/data/decks',
  'D:/MDPro3-master/MDPro3-master/Data/Windbot/Decks',
];

export function artProxyPlugin(): Plugin {
  return {
    name: 'mdpro-art-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // API: Get customization items
        if (req.url === '/api/customization') {
          res.setHeader('Content-Type', 'application/json');
          const icons: string[] = [];
          const frames: string[] = [];
          const mates: string[] = [];
          const fields: string[] = [];
          const wallpapers: string[] = [];

          const profileIconDir = resolve('D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/ProfileIcon/HD');
          if (existsSync(profileIconDir)) {
            icons.push(...readdirSync(profileIconDir).filter(f => f.endsWith('.png')).slice(0, 30));
          }

          const frameDir = resolve('D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/ProfileFrame/HD');
          if (existsSync(frameDir)) {
            frames.push(...readdirSync(frameDir).filter(f => f.endsWith('.png')).slice(0, 20));
          }

          const mateDir = resolve('D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Mate');
          if (existsSync(mateDir)) {
            mates.push(...readdirSync(mateDir).filter(f => f.endsWith('.png')).slice(0, 20));
          }

          const fieldDir = resolve('D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Field/HD');
          if (existsSync(fieldDir)) {
            fields.push(...readdirSync(fieldDir).filter(f => f.endsWith('.png')).slice(0, 20));
          }

          const wallpaperDir = resolve('D:/MDPro3-master/MDPro3-master/Assets/Addressables/Icon/Wallpaper');
          if (existsSync(wallpaperDir)) {
            wallpapers.push(...readdirSync(wallpaperDir).filter(f => f.endsWith('.png')).slice(0, 20));
          }

          res.end(JSON.stringify({ icons, frames, mates, fields, wallpapers }));
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
              if (existsSync(c)) {
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
              if (existsSync(c)) {
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
              if (existsSync(c)) {
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
      });
    },
  };
}
