import * as THREE from 'three';

export type ZoneType = 'monster' | 'spell' | 'emz' | 'deck' | 'grave' | 'extra' | 'banish' | 'field';

const textureCache = new Map<string, THREE.CanvasTexture>();

export function createZoneTexture(type: ZoneType, isPlayer0: boolean): THREE.CanvasTexture {
  const key = `${type}_${isPlayer0 ? 'p0' : 'p1'}`;
  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 368;
  const ctx = canvas.getContext('2d')!;

  const primaryColor = isPlayer0 ? '#00e5ff' : '#ff334b';
  const secondaryColor = isPlayer0 ? '#0077cc' : '#aa1122';
  const glowColor = isPlayer0 ? 'rgba(0, 229, 255, 0.35)' : 'rgba(255, 51, 75, 0.35)';

  if (type === 'emz') {
    // Extra Monster Zone: Golden Emerald
    ctx.fillStyle = '#061a14';
    ctx.fillRect(0, 0, 256, 368);
    drawZonePlate(ctx, '#00ffaa', '#008855', 'rgba(0, 255, 170, 0.4)', 'EMZ');
  } else {
    // Dark glass base
    ctx.fillStyle = isPlayer0 ? '#081020' : '#1a090d';
    ctx.fillRect(0, 0, 256, 368);
    drawZonePlate(ctx, primaryColor, secondaryColor, glowColor, type.toUpperCase());
  }

  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(key, texture);
  return texture;
}

function drawZonePlate(
  ctx: CanvasRenderingContext2D,
  border: string,
  accent: string,
  glow: string,
  label: string
) {
  // Beveled outer metallic border
  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.fillStyle = glow;

  const m = 12;
  const w = 256 - m * 2;
  const h = 368 - m * 2;
  const c = 18; // corner cut

  ctx.beginPath();
  ctx.moveTo(m + c, m);
  ctx.lineTo(m + w - c, m);
  ctx.lineTo(m + w, m + c);
  ctx.lineTo(m + w, m + h - c);
  ctx.lineTo(m + w - c, m + h);
  ctx.lineTo(m + c, m + h);
  ctx.lineTo(m, m + h - c);
  ctx.lineTo(m, m + c);
  ctx.closePath();

  ctx.fill();
  ctx.stroke();

  // Inner subtle framing
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.strokeRect(m + 16, m + 16, w - 32, h - 32);

  // Center Emblem based on zone type
  const cx = 128;
  const cy = 184;

  ctx.save();
  ctx.translate(cx, cy);

  if (label === 'MONSTER') {
    // Crossed Swords / Blade Symbol
    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-35, -45);
    ctx.lineTo(35, 45);
    ctx.moveTo(35, -45);
    ctx.lineTo(-35, 45);
    ctx.stroke();

    ctx.fillStyle = border;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
  } else if (label === 'SPELL') {
    // Magic Runes / Star Sigil
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * 36;
      const y = Math.sin(angle) * 36;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
  } else if (label === 'EMZ') {
    // Dual Arrow Link/Link Markers Emblem
    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    ctx.strokeRect(-28, -28, 56, 56);
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
  } else if (label === 'GRAVE') {
    // Crypt/Tombstone Emblem
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.strokeRect(-24, -20, 48, 40);
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, 12);
    ctx.stroke();
  } else {
    // Standard Deck/Extra/Field Card Back Silhouette
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.strokeRect(-22, -32, 44, 64);
  }

  ctx.restore();

  // Zone Label Text at bottom
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = border;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = border;
  ctx.shadowBlur = 10;
  ctx.fillText(label, cx, 368 - m - 24);
}
