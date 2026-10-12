import * as THREE from 'three';

export type ZoneType = 'monster' | 'spell' | 'emz' | 'deck' | 'grave' | 'extra' | 'banish' | 'field';

const textureCache = new Map<string, THREE.CanvasTexture>();

/**
 * Creates carved stone zone tile textures matching Screenshot 3 of Yu-Gi-Oh! Master Duel.
 */
export function createZoneTexture(type: ZoneType, isPlayer0: boolean): THREE.CanvasTexture {
  const key = `${type}_${isPlayer0 ? 'p0' : 'p1'}`;
  if (textureCache.has(key)) {
    return textureCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 368;
  const ctx = canvas.getContext('2d')!;

  const isPlayerSpell = isPlayer0 && type === 'spell';

  // 1. Stone slab base gradient
  const grad = ctx.createLinearGradient(0, 0, 256, 368);
  if (isPlayerSpell) {
    grad.addColorStop(0, '#4d6584');
    grad.addColorStop(0.5, '#3b5272');
    grad.addColorStop(1, '#2a4162');
  } else if (type === 'emz') {
    grad.addColorStop(0, '#5a667c');
    grad.addColorStop(0.5, '#485368');
    grad.addColorStop(1, '#394356');
  } else {
    grad.addColorStop(0, '#525d72');
    grad.addColorStop(0.5, '#414b5e');
    grad.addColorStop(1, '#313949');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 368);

  // 2. Outer chiseled stone bevel
  ctx.strokeStyle = 'rgba(20, 26, 36, 0.85)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 358);

  // Top-left stone highlight bevel
  ctx.strokeStyle = 'rgba(185, 205, 235, 0.32)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(10, 358);
  ctx.lineTo(10, 10);
  ctx.lineTo(246, 10);
  ctx.stroke();

  // 3. Inner carved recessed square frame (exact Master Duel stone tile pattern)
  ctx.strokeStyle = 'rgba(22, 28, 40, 0.65)';
  ctx.lineWidth = 5;
  ctx.strokeRect(36, 52, 184, 264);

  ctx.strokeStyle = 'rgba(175, 195, 225, 0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 56, 176, 256);

  // Corner stone seam lines
  ctx.strokeStyle = 'rgba(20, 26, 38, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 10);
  ctx.lineTo(36, 52);
  ctx.moveTo(246, 10);
  ctx.lineTo(220, 52);
  ctx.moveTo(10, 358);
  ctx.lineTo(36, 316);
  ctx.moveTo(246, 358);
  ctx.lineTo(220, 316);
  ctx.stroke();

  // 4. Subtle weathered stone cracks
  ctx.strokeStyle = 'rgba(18, 22, 32, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(65, 95);
  ctx.lineTo(95, 130);
  ctx.lineTo(82, 165);
  ctx.moveTo(185, 210);
  ctx.lineTo(155, 245);
  ctx.stroke();

  // 5. Holographic cyan glow overlay on Player 0 Spell/Trap zones (Screenshot 3)
  if (isPlayerSpell) {
    const holo = ctx.createLinearGradient(0, 0, 0, 368);
    holo.addColorStop(0, 'rgba(0, 195, 255, 0.08)');
    holo.addColorStop(0.6, 'rgba(0, 220, 255, 0.22)');
    holo.addColorStop(1, 'rgba(0, 180, 255, 0.35)');
    ctx.fillStyle = holo;
    ctx.fillRect(10, 10, 236, 348);

    ctx.strokeStyle = 'rgba(0, 225, 255, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, 232, 344);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}
