import * as THREE from 'three';
import { customAssets } from '../ui/custom-assets';

const fieldCache = new Map<string, THREE.CanvasTexture>();
const imgCache = new Map<string, HTMLImageElement>();

function getFieldImage(src: string): HTMLImageElement {
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    imgCache.set(src, img);
  }
  return img;
}

/**
 * Creates the Master Duel stone & holographic energy arena mat texture (Screenshot 3).
 * Supports built-in FieldIcons as well as user-uploaded custom field art ("custom_field").
 */
export function getFieldMatTexture(isPlayer0: boolean, fieldIcon = 'FieldIcon1090001.png'): THREE.CanvasTexture {
  const customUrl = fieldIcon === 'custom_field' ? customAssets.getUrl('custom_field') : undefined;
  const cacheKey = `${isPlayer0 ? 'p0' : 'p1'}_${fieldIcon}_${customUrl ? customUrl.slice(-24) : ''}`;
  const existing = fieldCache.get(cacheKey);
  if (existing) return existing;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  fieldCache.set(cacheKey, texture);

  const imgSrc =
    fieldIcon === 'custom_field' && customUrl
      ? customUrl
      : `/icon/${fieldIcon || 'FieldIcon1090001.png'}`;
  const customFieldImg = getFieldImage(imgSrc);

  const redraw = () => {
    // 1. Base carved stone slab background (Screenshot 3 aesthetic)
    const stoneGrad = ctx.createLinearGradient(0, 0, 0, 512);
    if (isPlayer0) {
      stoneGrad.addColorStop(0, '#3a4659');
      stoneGrad.addColorStop(0.55, '#2e3848');
      stoneGrad.addColorStop(1, '#182436');
    } else {
      stoneGrad.addColorStop(0, '#1e2433');
      stoneGrad.addColorStop(0.45, '#2d3546');
      stoneGrad.addColorStop(1, '#394457');
    }
    ctx.fillStyle = stoneGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // 2. Blend chosen Field Art or Custom Uploaded Field Art
    if (customFieldImg && customFieldImg.complete && customFieldImg.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = fieldIcon === 'custom_field' ? 0.65 : 0.32;
      ctx.drawImage(customFieldImg, 0, 0, 1024, 512);
      ctx.restore();
    }

    // 3. Subtle stone cracks / weathered marble grain
    ctx.strokeStyle = 'rgba(15, 20, 30, 0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 28; i++) {
      const sx = (i * 137) % 1024;
      const sy = (i * 89) % 512;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ((i % 3) - 1) * 45, sy + 28);
      ctx.lineTo(sx + ((i % 5) - 2) * 30, sy + 55);
      ctx.stroke();
    }

    // 4. Glowing Cyan Holographic Energy Bars on Player 0 Backrow (Screenshot 3)
    if (isPlayer0) {
      const holoGrad = ctx.createLinearGradient(0, 290, 0, 495);
      holoGrad.addColorStop(0, 'rgba(0, 195, 255, 0.0)');
      holoGrad.addColorStop(0.35, 'rgba(0, 195, 255, 0.22)');
      holoGrad.addColorStop(0.8, 'rgba(0, 225, 255, 0.38)');
      holoGrad.addColorStop(1, 'rgba(0, 160, 255, 0.12)');
      ctx.fillStyle = holoGrad;
      ctx.fillRect(140, 290, 744, 200);

      // Vertical digital hologram bars
      ctx.fillStyle = 'rgba(60, 220, 255, 0.22)';
      for (let x = 152; x < 875; x += 14) {
        const barH = 70 + ((x * 19) % 95);
        ctx.fillRect(x, 480 - barH, 5, barH);
      }
    }

    // 5. Outer Arena Stone Bevel & Neon Conduit Border
    ctx.strokeStyle = isPlayer0 ? 'rgba(0, 225, 255, 0.65)' : 'rgba(160, 175, 205, 0.35)';
    ctx.lineWidth = 4;
    drawChamferedRect(ctx, 14, 14, 996, 484, 26);
    ctx.stroke();

    texture.needsUpdate = true;
  };

  if (customFieldImg && !customFieldImg.complete) {
    customFieldImg.addEventListener('load', redraw, { once: true });
  }

  redraw();
  return texture;
}

function drawChamferedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  c: number
) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}
