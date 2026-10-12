import * as THREE from 'three';
import { TYPE } from '../engine/constants';
import { type CardData, getCardTypeInfo, RACE_NAMES } from '../engine/card-database';

import { customAssets } from '../ui/custom-assets';

let cachedBackCanvas: HTMLCanvasElement | null = null;
let cachedBackTexture: THREE.CanvasTexture | null = null;
const imageCache = new Map<string, HTMLImageElement>();

function getImage(url: string): HTMLImageElement {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

export interface ProtectorSleeveOption {
  id: string;
  label: string;
  thumbType: 'texture' | 'classic' | 'theme' | 'card';
  thumbUrl?: string;
  themeColor?: string;
}

export const PROTECTOR_SLEEVE_OPTIONS: ProtectorSleeveOption[] = [
  { id: 'DefaultProtector.png', label: 'Master Duel Default', thumbType: 'texture', thumbUrl: '/texture/DefaultProtector.png' },
  { id: 'classic', label: 'Yu-Gi-Oh! Classic', thumbType: 'classic' },
  { id: 'sleeve_gold', label: 'Millennium Gold', thumbType: 'theme', themeColor: 'linear-gradient(135deg, #ffd700, #5c4004, #d4af37)' },
  { id: 'sleeve_blue', label: 'Obelisk Royal Blue', thumbType: 'theme', themeColor: 'linear-gradient(135deg, #00d4ff, #061c4c, #1e88e5)' },
  { id: 'sleeve_red', label: 'Slifer Crimson', thumbType: 'theme', themeColor: 'linear-gradient(135deg, #ff3355, #4a0612, #d50000)' },
  { id: 'sleeve_cyber', label: 'Link VRAINS Cyber', thumbType: 'theme', themeColor: 'linear-gradient(135deg, #00ffcc, #04222c, #0088aa)' },
  { id: 'sleeve_dark', label: 'Shadow Abyss', thumbType: 'theme', themeColor: 'linear-gradient(135deg, #b388ff, #1a0633, #6200ea)' },
  { id: 'sleeve_synchro', label: 'Stardust Silver', thumbType: 'theme', themeColor: 'linear-gradient(135deg, #ffffff, #37474f, #90a4ae)' },
  { id: 'sleeve_card_89631139', label: 'Blue-Eyes White Dragon', thumbType: 'card', thumbUrl: '/pics/89631139.jpg' },
  { id: 'sleeve_card_46986414', label: 'Dark Magician', thumbType: 'card', thumbUrl: '/pics/46986414.jpg' },
  { id: 'sleeve_card_92731385', label: 'Tearlaments Kitkallos', thumbType: 'card', thumbUrl: '/pics/92731385.jpg' },
  { id: 'sleeve_card_86066372', label: 'Accesscode Talker', thumbType: 'card', thumbUrl: '/pics/86066372.jpg' },
  { id: 'sleeve_card_48626373', label: 'Kashtira Arise-Heart', thumbType: 'card', thumbUrl: '/pics/48626373.jpg' },
  { id: 'sleeve_card_90448279', label: 'Divine Arsenal AA-ZEUS', thumbType: 'card', thumbUrl: '/pics/90448279.jpg' },
  { id: 'sleeve_card_14558127', label: 'Ash Blossom', thumbType: 'card', thumbUrl: '/pics/14558127.jpg' },
  { id: 'sleeve_card_84815190', label: 'Baronne de Fleur', thumbType: 'card', thumbUrl: '/pics/84815190.jpg' },
  { id: 'sleeve_card_68468459', label: 'Fallen of Albaz', thumbType: 'card', thumbUrl: '/pics/68468459.jpg' },
  { id: 'sleeve_card_29301450', label: 'S:P Little Knight', thumbType: 'card', thumbUrl: '/pics/29301450.jpg' },
];

function drawClassicYgoBack(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const borderGrad = ctx.createLinearGradient(0, 0, w, h);
  borderGrad.addColorStop(0, '#6e3a1a');
  borderGrad.addColorStop(0.5, '#a86434');
  borderGrad.addColorStop(1, '#4a220c');
  ctx.fillStyle = borderGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#d49b56';
  ctx.lineWidth = 10;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  const radGrad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.65);
  radGrad.addColorStop(0, '#ff8822');
  radGrad.addColorStop(0.35, '#8a2be2');
  radGrad.addColorStop(0.7, '#32101e');
  radGrad.addColorStop(1, '#12050a');
  ctx.fillStyle = radGrad;
  ctx.fillRect(28, 28, w - 56, h - 56);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(1, 1.45);
  for (let r = 135; r > 15; r -= 18) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = r % 36 === 0 ? 'rgba(255, 170, 70, 0.55)' : 'rgba(20, 5, 10, 0.75)';
    ctx.lineWidth = 9;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 48, 0, Math.PI * 2);
  ctx.fillStyle = '#080205';
  ctx.fill();
  ctx.restore();
}

function drawSleeveMetallicFrame(ctx: CanvasRenderingContext2D, w: number, h: number, rimColor = '#d4af37') {
  // Outer metallic sleeve border
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, w - 18, h - 18);

  // Inner holographic hairline
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  // Corner foil triangles
  const cSize = 36;
  ctx.fillStyle = rimColor;
  // Top-left
  ctx.beginPath();
  ctx.moveTo(18, 18);
  ctx.lineTo(18 + cSize, 18);
  ctx.lineTo(18, 18 + cSize);
  ctx.closePath();
  ctx.fill();
  // Top-right
  ctx.beginPath();
  ctx.moveTo(w - 18, 18);
  ctx.lineTo(w - 18 - cSize, 18);
  ctx.lineTo(w - 18, 18 + cSize);
  ctx.closePath();
  ctx.fill();
  // Bottom-left
  ctx.beginPath();
  ctx.moveTo(18, h - 18);
  ctx.lineTo(18 + cSize, h - 18);
  ctx.lineTo(18, h - 18 - cSize);
  ctx.closePath();
  ctx.fill();
  // Bottom-right
  ctx.beginPath();
  ctx.moveTo(w - 18, h - 18);
  ctx.lineTo(w - 18 - cSize, h - 18);
  ctx.lineTo(w - 18, h - 18 - cSize);
  ctx.closePath();
  ctx.fill();
}

function drawThemedSleeve(ctx: CanvasRenderingContext2D, w: number, h: number, themeId: string) {
  const palettes: Record<string, { c1: string; c2: string; c3: string; rim: string }> = {
    sleeve_gold: { c1: '#ffd740', c2: '#5c4004', c3: '#181002', rim: '#ffd700' },
    sleeve_blue: { c1: '#00e5ff', c2: '#082868', c3: '#030b20', rim: '#40c4ff' },
    sleeve_red: { c1: '#ff4081', c2: '#68081c', c3: '#1e0208', rim: '#ff5252' },
    sleeve_cyber: { c1: '#00ffc8', c2: '#043844', c3: '#021218', rim: '#00e5ff' },
    sleeve_dark: { c1: '#b388ff', c2: '#2e0854', c3: '#0c0218', rim: '#d580ff' },
    sleeve_synchro: { c1: '#ffffff', c2: '#546e7a', c3: '#162026', rim: '#e0f7fa' },
  };
  const pal = palettes[themeId] ?? palettes.sleeve_gold;

  const rad = ctx.createRadialGradient(w / 2, h / 2, 12, w / 2, h / 2, h * 0.62);
  rad.addColorStop(0, pal.c1);
  rad.addColorStop(0.45, pal.c2);
  rad.addColorStop(1, pal.c3);
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, w, h);

  // Geometric crest in center
  ctx.save();
  ctx.translate(w / 2, h / 2);
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-95, -95, 190, 190);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 56, 0, Math.PI * 2);
  ctx.strokeStyle = pal.rim;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();

  drawSleeveMetallicFrame(ctx, w, h, pal.rim);
}

export function setCardBackSource(source = 'DefaultProtector.png') {
  const tex = getCardBackTexture();
  const canvas = cachedBackCanvas!;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  if (source === 'classic') {
    drawClassicYgoBack(ctx, w, h);
    tex.needsUpdate = true;
    return;
  }

  if (source.startsWith('sleeve_') && !source.startsWith('sleeve_card_')) {
    drawThemedSleeve(ctx, w, h, source);
    tex.needsUpdate = true;
    return;
  }

  let url = '/texture/DefaultProtector.png';
  let isCardArtSleeve = false;

  if (source === 'custom_protector') {
    url = customAssets.getUrl('custom_protector') || '/texture/DefaultProtector.png';
    isCardArtSleeve = true;
  } else if (source.startsWith('sleeve_card_')) {
    const cardCode = source.replace('sleeve_card_', '');
    url = `/pics/${cardCode}.jpg`;
    isCardArtSleeve = true;
  } else if (source && source !== 'DefaultProtector.png') {
    // If legacy profile had WallPaperIcon*, fallback cleanly to DefaultProtector.png
    if (source.startsWith('WallPaperIcon')) {
      url = '/texture/DefaultProtector.png';
    } else {
      url =
        source.startsWith('/') || source.startsWith('data:') || source.startsWith('blob:')
          ? source
          : `/texture/${source}`;
    }
  }

  const img = getImage(url);
  const paint = () => {
    if (img.complete && img.naturalWidth > 0) {
      ctx.fillStyle = '#080c14';
      ctx.fillRect(0, 0, w, h);
      if (isCardArtSleeve) {
        // Draw card art inside metallic protector sleeve border
        ctx.drawImage(img, 18, 18, w - 36, h - 36);
        drawSleeveMetallicFrame(ctx, w, h, '#d4af37');
      } else {
        ctx.drawImage(img, 0, 0, w, h);
      }
      tex.needsUpdate = true;
    } else {
      drawClassicYgoBack(ctx, w, h);
      tex.needsUpdate = true;
    }
  };

  if (img.complete && img.naturalWidth > 0) {
    paint();
  } else {
    drawClassicYgoBack(ctx, w, h);
    tex.needsUpdate = true;
    img.addEventListener('load', paint, { once: true });
  }
}

/**
 * Returns the shared dynamic card back texture (updated via setCardBackSource).
 */
export function getCardBackTexture(): THREE.CanvasTexture {
  if (cachedBackTexture) return cachedBackTexture;
  cachedBackCanvas = document.createElement('canvas');
  cachedBackCanvas.width = 512;
  cachedBackCanvas.height = 744;
  cachedBackTexture = new THREE.CanvasTexture(cachedBackCanvas);
  cachedBackTexture.colorSpace = THREE.SRGBColorSpace;
  setCardBackSource('DefaultProtector.png');
  return cachedBackTexture;
}

export function getFrameTextureName(card: CardData | null): string {
  if (!card) return 'card_frame01.png';
  const t = card.type;

  // Spells and Traps
  if (t & TYPE.SPELL) return 'card_frame07.png'; // Spell (Magic = 7)
  if (t & TYPE.TRAP) return 'card_frame08.png';  // Trap (Trap = 8)

  // Extra deck & special monsters
  if (t & TYPE.LINK) return 'card_frame18.png';  // Link (Link = 18)
  if (t & TYPE.XYZ) {
    if (t & TYPE.PENDULUM) return 'card_frame15.png';
    return 'card_frame12.png'; // Xyz (Xyz = 12)
  }
  if (t & TYPE.SYNCHRO) {
    if (t & TYPE.PENDULUM) return 'card_frame16.png';
    return 'card_frame10.png'; // Synchro (Sync = 10)
  }
  if (t & TYPE.FUSION) {
    if (t & TYPE.PENDULUM) return 'card_frame17.png';
    return 'card_frame03.png'; // Fusion (Fusion = 3)
  }
  if (t & TYPE.RITUAL) {
    if (t & TYPE.PENDULUM) return 'card_frame17.png';
    return 'card_frame02.png'; // Ritual (Ritual = 2)
  }
  if (t & TYPE.PENDULUM) {
    if (t & TYPE.NORMAL) return 'card_frame13.png';
    return 'card_frame14.png';
  }
  if (t & TYPE.TOKEN) return 'card_frame09.png';  // Token (Token = 9)
  if (t & TYPE.NORMAL) return 'card_frame00.png'; // Normal (Normal = 0)
  return 'card_frame01.png'; // Effect (Effect = 1)
}

/**
 * Creates a high-fidelity card front texture using authentic Master Duel frames and art.
 */
export function createCardFrontTexture(card: CardData | null, cardCode: number): THREE.CanvasTexture {
  const width = 704;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const frameFileName = getFrameTextureName(card);
  const frameUrl = `/texture/${frameFileName}`;
  const artUrl = `/pics/${cardCode}.jpg`;

  const frameImg = getImage(frameUrl);
  const artImg = getImage(artUrl);

  const redraw = () => {
    // 1. Clear background
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw card art (in the transparent frame illustration opening: x:89, y:191, w:527, h:527)
    if (artImg.complete && artImg.naturalWidth > 0) {
      ctx.drawImage(artImg, 89, 191, 527, 527);
    } else {
      // Sleek placeholder while loading
      const grad = ctx.createLinearGradient(89, 191, 616, 718);
      grad.addColorStop(0, '#1c2333');
      grad.addColorStop(1, '#0e121a');
      ctx.fillStyle = grad;
      ctx.fillRect(89, 191, 527, 527);
    }

    // 3. Draw official Master Duel frame overlay
    if (frameImg.complete && frameImg.naturalWidth > 0) {
      ctx.drawImage(frameImg, 0, 0, width, height);
    } else {
      // Fallback border
      ctx.strokeStyle = '#d98c36';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, width - 14, height - 14);
    }

    // 4. Draw Card Name Header
    const name = card?.name ?? `Card #${cardCode}`;
    const isXyz = card ? Boolean(card.type & TYPE.XYZ) : false;
    const isSpell = card ? Boolean(card.type & TYPE.SPELL) : false;
    const isTrap = card ? Boolean(card.type & TYPE.TRAP) : false;
    const isFusion = card ? Boolean(card.type & TYPE.FUSION) : false;
    const isRitual = card ? Boolean(card.type & TYPE.RITUAL) : false;
    const isLink = card ? Boolean(card.type & TYPE.LINK) : false;
    const isWhiteText = isXyz || isSpell || isTrap || isFusion || isRitual || isLink;

    ctx.save();
    ctx.font = 'bold 31px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'middle';

    if (isWhiteText) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.fillStyle = '#141416';
      ctx.shadowColor = 'rgba(255,255,255,0.35)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
    }

    // Clip & dynamically scale name within the top header area
    const maxNameWidth = 490;
    let nameFontSize = 31;
    ctx.font = `bold ${nameFontSize}px "Segoe UI", Arial, sans-serif`;
    while (ctx.measureText(name).width > maxNameWidth && nameFontSize > 18) {
      nameFontSize -= 1.5;
      ctx.font = `bold ${nameFontSize}px "Segoe UI", Arial, sans-serif`;
    }
    let displayName = name;
    if (ctx.measureText(displayName).width > maxNameWidth) {
      while (displayName.length > 3 && ctx.measureText(displayName + '...').width > maxNameWidth) {
        displayName = displayName.slice(0, -1);
      }
      displayName += '...';
    }
    // Centered vertically in name banner (y: 104)
    ctx.fillText(displayName, 76, 104);
    ctx.restore();

    // 5. Monster stats: Level/Rank, Type Line, Lore / Effect Text & ATK/DEF
    if (card && (card.type & TYPE.MONSTER)) {
      // Draw Stars (Level / Rank)
      const level = card.level ?? 0;
      if (level > 0 && level <= 13) {
        const starSize = 28;
        const starGap = 4;
        const totalStarsWidth = level * (starSize + starGap);
        const startX = isXyz ? 82 : 614 - totalStarsWidth;
        const starY = 163;

        ctx.save();
        for (let i = 0; i < level; i++) {
          const sx = startX + i * (starSize + starGap);
          ctx.fillStyle = isXyz ? '#e52525' : '#ffcc00';
          ctx.shadowColor = isXyz ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 3;
          ctx.beginPath();
          drawStar(ctx, sx + starSize / 2, starY, 5, starSize / 2, starSize / 4);
          ctx.fill();
        }
        ctx.restore();
      }

      // Draw Monster Race / Subtype bar (e.g. 【Aqua / Fusion / Effect】)
      const typeInfo = getCardTypeInfo(card);
      const raceName = RACE_NAMES[card.race] ?? 'Monster';
      const subTypeStr = typeInfo.subType ? ` / ${typeInfo.subType}` : '';
      const fullTypeStr = `【${raceName}${subTypeStr}】`;

      ctx.save();
      ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = (isXyz || isLink) ? '#ffffff' : '#141416';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(fullTypeStr, 76, 768);
      ctx.restore();

      // Draw Monster Effect / Lore Text Box
      if (card.desc) {
        ctx.save();
        ctx.font = '14.5px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = (isXyz || isLink) ? '#e2e8f0' : '#1a1c22';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        drawWrappedText(ctx, card.desc, 76, 788, 545, 17.5, 9);
        ctx.restore();
      }

      // Draw ATK / DEF bar at bottom right
      ctx.save();
      ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = (isXyz || isLink) ? '#ffffff' : '#141416';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';

      const atkStr = card.atk === -2 ? '?' : String(card.atk ?? 0);
      const defStr = (card.type & TYPE.LINK) ? `LINK-${card.level ?? 0}` : (card.def === -2 ? '?' : String(card.def ?? 0));
      const statsText = `ATK/ ${atkStr}   DEF/ ${defStr}`;

      ctx.fillText(statsText, 618, 968);
      ctx.restore();
    } else if (card && (isSpell || isTrap)) {
      // Draw Spell/Trap subtype tag under attribute banner
      ctx.save();
      ctx.font = 'bold 23px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      let typeTag = isSpell ? '[Spell Card]' : '[Trap Card]';
      if (card.type & TYPE.FIELD) typeTag = '[Field Spell ✦]';
      else if (card.type & TYPE.QUICKPLAY) typeTag = '[Quick-Play ⚡]';
      else if (card.type & TYPE.CONTINUOUS) typeTag = isSpell ? '[Continuous Spell ∞]' : '[Continuous Trap ∞]';
      else if (card.type & TYPE.COUNTER) typeTag = '[Counter Trap ↩]';
      else if (card.type & TYPE.EQUIP) typeTag = '[Equip Spell ✚]';
      else if (card.type & TYPE.RITUAL) typeTag = '[Ritual Spell ♨]';

      ctx.fillText(typeTag, 616, 163);
      ctx.restore();

      // Draw Spell / Trap Effect Text
      if (card.desc) {
        ctx.save();
        ctx.font = '14.5px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#1a1c22';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        drawWrappedText(ctx, card.desc, 76, 780, 545, 17.5, 10);
        ctx.restore();
      }
    }

    texture.needsUpdate = true;
  };

  // Listen for image load events to automatically update the texture
  if (!frameImg.complete) {
    frameImg.addEventListener('load', redraw, { once: true });
  }
  if (!artImg.complete) {
    artImg.addEventListener('load', redraw, { once: true });
  }

  // Initial draw
  redraw();

  return texture;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = clean.split('\n');
  let currentY = y;
  let linesDrawn = 0;

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      currentY += lineHeight * 0.4;
      continue;
    }
    const words = paragraph.split(' ');
    let currentLine = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = currentLine ? currentLine + ' ' + words[n] : words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(currentLine, x, currentY);
        currentLine = words[n];
        currentY += lineHeight;
        linesDrawn++;
        if (linesDrawn >= maxLines) return;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      ctx.fillText(currentLine, x, currentY);
      currentY += lineHeight;
      linesDrawn++;
      if (linesDrawn >= maxLines) return;
    }
  }
}

