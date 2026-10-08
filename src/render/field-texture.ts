import * as THREE from 'three';

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
 * Creates authentic duel field mat texture inspired by Yu-Gi-Oh! Master Duel.
 * Uses real Master Duel Jungle textures (Mat_002) for default / 1090001 field,
 * or blends the chosen field icon.
 */
export function getFieldMatTexture(isPlayer0: boolean, fieldIcon = 'FieldIcon1090001.png'): THREE.CanvasTexture {
  const cacheKey = `${isPlayer0 ? 'p0' : 'p1'}_${fieldIcon}`;
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

  const isJungle = !fieldIcon || fieldIcon.includes('1090001');

  // Jungle asset images
  const terrainImg = isJungle ? getFieldImage('/texture/Mat_002_02_BaseColor_near.png') : null;
  const stoneTileImg = isJungle ? getFieldImage('/texture/Mat_002_01_BaseColor_near.png') : null;
  const customFieldImg = !isJungle ? getFieldImage(`/icon/${fieldIcon}`) : null;

  const redraw = () => {
    const primary = isPlayer0 ? '#00e5ff' : '#ff334b';

    if (isJungle) {
      // 1. Jungle Mossy Ground Base
      if (terrainImg && terrainImg.complete && terrainImg.naturalWidth > 0) {
        // Sample jungle dirt/grass terrain
        ctx.drawImage(terrainImg, 760, 580, 500, 440, 0, 0, 1024, 512);
      } else {
        // Lush jungle moss green & dark stone gradient
        const mossGrad = ctx.createLinearGradient(0, 0, 1024, 512);
        mossGrad.addColorStop(0, isPlayer0 ? '#101c14' : '#1e1414');
        mossGrad.addColorStop(0.5, isPlayer0 ? '#14281c' : '#221418');
        mossGrad.addColorStop(1, isPlayer0 ? '#0c1610' : '#160e10');
        ctx.fillStyle = mossGrad;
        ctx.fillRect(0, 0, 1024, 512);
      }

      // Dark jungle vignette overlay
      const vigGrad = ctx.createRadialGradient(512, 256, 120, 512, 256, 540);
      vigGrad.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
      vigGrad.addColorStop(1, 'rgba(2, 6, 4, 0.7)');
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, 1024, 512);

      // 2. Stamp Ancient Octagon Stone Tiles at 5 zone columns
      const colsX = [180, 346, 512, 678, 844];
      const rowY = isPlayer0 ? 200 : 312;

      for (const cx of colsX) {
        if (stoneTileImg && stoneTileImg.complete && stoneTileImg.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          drawOctagon(ctx, cx, rowY, 56);
          ctx.clip();
          ctx.drawImage(stoneTileImg, 220, 220, 360, 340, cx - 60, rowY - 60, 120, 120);
          ctx.restore();
        }

        // Stone border bevel
        ctx.strokeStyle = 'rgba(120, 150, 110, 0.35)';
        ctx.lineWidth = 2.5;
        drawOctagon(ctx, cx, rowY, 56);
        ctx.stroke();
      }

      // Stone runes & border
      ctx.strokeStyle = isPlayer0 ? 'rgba(70, 190, 160, 0.45)' : 'rgba(200, 80, 80, 0.45)';
      ctx.lineWidth = 3;
      drawChamferedRect(ctx, 16, 16, 992, 480, 28);
      ctx.stroke();
    } else {
      // Custom / Non-Jungle field: draw atmospheric tech arena with field backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
      bgGrad.addColorStop(0, isPlayer0 ? '#0a1220' : '#1a0d14');
      bgGrad.addColorStop(1, isPlayer0 ? '#050811' : '#0e060a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 1024, 512);

      if (customFieldImg && customFieldImg.complete && customFieldImg.naturalWidth > 0) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.drawImage(customFieldImg, 256, 0, 512, 512);
        ctx.restore();
      }

      ctx.strokeStyle = isPlayer0 ? 'rgba(0, 180, 255, 0.05)' : 'rgba(255, 60, 90, 0.05)';
      ctx.lineWidth = 1;
      const hexSize = 24;
      const hexH = hexSize * Math.sqrt(3);
      for (let y = 0; y < 512 + hexH; y += hexH) {
        for (let x = 0; x < 1024 + hexSize * 3; x += hexSize * 3) {
          drawHex(ctx, x, y, hexSize);
          drawHex(ctx, x + hexSize * 1.5, y + hexH / 2, hexSize);
        }
      }

      ctx.strokeStyle = primary;
      ctx.lineWidth = 4;
      drawChamferedRect(ctx, 18, 18, 988, 476, 32);
      ctx.stroke();
    }

    texture.needsUpdate = true;
  };

  if (terrainImg && !terrainImg.complete) terrainImg.addEventListener('load', redraw, { once: true });
  if (stoneTileImg && !stoneTileImg.complete) stoneTileImg.addEventListener('load', redraw, { once: true });
  if (customFieldImg && !customFieldImg.complete) customFieldImg.addEventListener('load', redraw, { once: true });

  redraw();
  return texture;
}

function drawOctagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4 + Math.PI / 8;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
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

function drawHex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const hx = x + r * Math.cos(angle);
    const hy = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.stroke();
}
