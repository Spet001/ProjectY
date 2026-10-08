import * as THREE from 'three';
import { TYPE } from '../engine/constants';
import { type CardData, getCardTypeInfo, RACE_NAMES } from '../engine/card-database';

let cachedBackTexture: THREE.Texture | null = null;
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

/**
 * Loads and returns the authentic Master Duel card back (DefaultProtector.png).
 */
export function getCardBackTexture(): THREE.Texture {
  if (cachedBackTexture) return cachedBackTexture;
  const loader = new THREE.TextureLoader();
  cachedBackTexture = loader.load(
    '/texture/DefaultProtector.png',
    () => {
      if (cachedBackTexture) cachedBackTexture.needsUpdate = true;
    },
    undefined,
    () => {
      // Fallback if network or file missing
      console.warn('Failed to load Master Duel DefaultProtector.png, using procedural back');
    }
  );
  cachedBackTexture.colorSpace = THREE.SRGBColorSpace;
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

