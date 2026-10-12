import * as THREE from 'three';
import gsap from 'gsap';
import { CARD_WIDTH, CARD_HEIGHT, CARD_THICKNESS } from './constants';
import { POS, LOCATION, TYPE } from '../engine/constants';
import { getCardBackTexture, createCardFrontTexture } from './card-texture';
import type { CardData } from '../engine/card-database';

export class CardMesh {
  public group: THREE.Group;
  public frontMesh: THREE.Mesh;
  public backMesh: THREE.Mesh;
  public edgeMesh: THREE.Mesh;
  public glowMesh: THREE.Mesh;

  public id = '';
  public code: number;
  public cardData: CardData | null = null;
  public location = 0;
  public sequence = 0;
  public controller = 0;
  public position: number = POS.FACEUP_ATTACK;

  public isSelectable = false;
  public isSelected = false;

  private isHovered = false;
  private statLabelMesh: THREE.Sprite | null = null;
  private statCanvas: HTMLCanvasElement | null = null;
  private statTexture: THREE.CanvasTexture | null = null;
  private basePosition = new THREE.Vector3();
  private baseRotation = new THREE.Euler();
  private pulseTween: gsap.core.Tween | null = null;

  constructor(code: number, cardData: CardData | null) {
    this.code = code;
    this.cardData = cardData;
    this.group = new THREE.Group();
    this.group.userData.card = this;

    const w = CARD_WIDTH;
    const h = CARD_HEIGHT;
    const t = CARD_THICKNESS;

    // Front geometry and material
    const frontGeo = new THREE.PlaneGeometry(w, h);
    const frontTex = createCardFrontTexture(cardData, code);
    const frontMat = new THREE.MeshStandardMaterial({
      map: frontTex,
      roughness: 0.35,
      metalness: 0.1,
    });
    this.frontMesh = new THREE.Mesh(frontGeo, frontMat);
    this.frontMesh.position.z = t / 2 + 0.002;
    this.frontMesh.renderOrder = 2;
    this.group.add(this.frontMesh);

    // Back geometry and material (Official Master Duel Protector)
    const backGeo = new THREE.PlaneGeometry(w, h);
    const backTex = getCardBackTexture();
    const backMat = new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.4,
      metalness: 0.1,
    });
    this.backMesh = new THREE.Mesh(backGeo, backMat);
    this.backMesh.position.z = -t / 2 - 0.002;
    this.backMesh.rotation.y = Math.PI;
    this.backMesh.renderOrder = 2;
    this.group.add(this.backMesh);

    // Dark card border edge
    const edgeGeo = new THREE.BoxGeometry(w, h, t);
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.8,
    });
    this.edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
    this.edgeMesh.renderOrder = 2;
    this.group.add(this.edgeMesh);

    // Selection Glow border
    const glowGeo = new THREE.PlaneGeometry(w + 0.09, h + 0.09);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.glowMesh = new THREE.Mesh(glowGeo, glowMat);
    this.glowMesh.position.z = 0;
    this.glowMesh.visible = false;
    this.glowMesh.renderOrder = 3;
    this.group.add(this.glowMesh);
  }

  setWorldTransform(
    pos: { x: number; y: number; z: number },
    rot?: { x?: number; y?: number; z?: number },
    animate = true,
    duration = 0.4
  ) {
    this.basePosition.set(pos.x, pos.y, pos.z);
    if (rot) {
      this.baseRotation.set(rot.x ?? 0, rot.y ?? 0, rot.z ?? 0);
    }

    if (animate) {
      gsap.to(this.group.position, {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        duration,
        ease: 'power2.out',
      });
      if (rot) {
        gsap.to(this.group.rotation, {
          x: rot.x ?? this.group.rotation.x,
          y: rot.y ?? this.group.rotation.y,
          z: rot.z ?? this.group.rotation.z,
          duration,
          ease: 'power2.out',
        });
      }
    } else {
      this.group.position.set(pos.x, pos.y, pos.z);
      if (rot) {
        if (rot.x !== undefined) this.group.rotation.x = rot.x;
        if (rot.y !== undefined) this.group.rotation.y = rot.y;
        if (rot.z !== undefined) this.group.rotation.z = rot.z;
      }
    }
  }

  setBattlePosition(pos: number, animate = true) {
    this.position = pos;
    let rx = -Math.PI / 2; // Flat on the duel board
    let ry = 0;
    let rz = 0;

    // Face-down
    const isFacedown = (pos === POS.FACEDOWN_ATTACK || pos === POS.FACEDOWN_DEFENSE || pos === POS.FACEDOWN);
    if (isFacedown) {
      rx = Math.PI / 2;
    }

    // Defense: ONLY monsters can rotate sideways!
    // Spells and Traps in SZONE NEVER rotate sideways!
    const isSpellOrTrap = this.location === LOCATION.SZONE || (this.cardData ? Boolean(this.cardData.type & (TYPE.SPELL | TYPE.TRAP)) : false);
    const isDefense = (pos === POS.FACEUP_DEFENSE || pos === POS.FACEDOWN_DEFENSE);
    if (!isSpellOrTrap && isDefense) {
      rz = Math.PI / 2;
    }

    this.baseRotation.set(rx, ry, rz);

    if (animate) {
      gsap.to(this.group.rotation, {
        x: rx,
        y: ry,
        z: rz,
        duration: 0.35,
        ease: 'back.out(1.4)',
      });
    } else {
      this.group.rotation.set(rx, ry, rz);
    }
  }

  setSelectable(selectable: boolean, color = 0xffcc00) {
    this.isSelectable = selectable;
    if (!selectable && !this.isSelected) {
      this.glowMesh.visible = false;
      if (this.pulseTween) {
        this.pulseTween.kill();
        this.pulseTween = null;
      }
      return;
    }

    this.glowMesh.visible = true;
    const mat = this.glowMesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(color);

    if (selectable && !this.pulseTween) {
      mat.opacity = 0.4;
      this.pulseTween = gsap.to(mat, {
        opacity: 0.95,
        duration: 0.65,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      });
    }
  }

  setSelected(selected: boolean) {
    this.isSelected = selected;
    if (selected) {
      this.setSelectable(true, 0x00ffff);
    } else if (this.isSelectable) {
      this.setSelectable(true, 0xffcc00);
    } else {
      this.setSelectable(false);
    }
  }

  setHover(hover: boolean) {
    if (this.isHovered === hover) return;
    this.isHovered = hover;

    if (hover) {
      gsap.to(this.group.position, {
        y: this.basePosition.y + 0.2,
        duration: 0.15,
        ease: 'power2.out',
      });
      gsap.to(this.group.scale, {
        x: 1.08,
        y: 1.08,
        z: 1.08,
        duration: 0.15,
      });
    } else {
      gsap.to(this.group.position, {
        y: this.basePosition.y,
        duration: 0.15,
        ease: 'power2.out',
      });
      gsap.to(this.group.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 0.15,
      });
    }
  }

  private faceHidden = false;

  isFaceHidden(): boolean {
    return this.faceHidden;
  }

  updateFrontTexture(cardData: CardData | null, code: number) {
    this.code = code;
    this.cardData = cardData;
    const newTex = this.faceHidden ? getCardBackTexture() : createCardFrontTexture(cardData, code);
    (this.frontMesh.material as THREE.MeshStandardMaterial).map = newTex;
    (this.frontMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  setFaceHidden(hidden: boolean) {
    if (this.faceHidden === hidden) return;
    this.faceHidden = hidden;
    const newTex = hidden ? getCardBackTexture() : createCardFrontTexture(this.cardData, this.code);
    (this.frontMesh.material as THREE.MeshStandardMaterial).map = newTex;
    (this.frontMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
  }

  updateStats(attack?: number, defense?: number) {
    const isFaceupMonster =
      this.location === LOCATION.MZONE &&
      (this.position === POS.FACEUP_ATTACK || this.position === POS.FACEUP_DEFENSE || this.position === POS.FACEUP);

    if (!isFaceupMonster) {
      if (this.statLabelMesh) this.statLabelMesh.visible = false;
      return;
    }

    const atkVal = attack !== undefined ? attack : (this.cardData?.atk ?? 0);
    const defVal = defense !== undefined ? defense : (this.cardData?.def ?? 0);
    const atkStr = atkVal === -2 ? '?' : String(atkVal);
    const defStr = defVal === -2 ? '?' : String(defVal);
    const text = `${atkStr} / ${defStr}`;

    if (!this.statLabelMesh) {
      this.statCanvas = document.createElement('canvas');
      this.statCanvas.width = 256;
      this.statCanvas.height = 64;
      this.statTexture = new THREE.CanvasTexture(this.statCanvas);
      this.statTexture.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({
        map: this.statTexture,
        transparent: true,
        depthWrite: false,
      });
      this.statLabelMesh = new THREE.Sprite(mat);
      this.statLabelMesh.scale.set(1.15, 0.28, 1);
      this.statLabelMesh.position.set(0, 0, 0.72);
      this.group.add(this.statLabelMesh);
    }

    if (this.statCanvas && this.statTexture) {
      const ctx = this.statCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 64);

      // Pill container
      ctx.fillStyle = 'rgba(6, 10, 18, 0.88)';
      ctx.strokeStyle = '#ffcc00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 24);
      ctx.fill();
      ctx.stroke();

      // Stats Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 32);

      this.statTexture.needsUpdate = true;
    }
    this.statLabelMesh.visible = true;
  }

  dispose() {
    if (this.pulseTween) {
      this.pulseTween.kill();
    }
    if (this.statLabelMesh) {
      this.statLabelMesh.material.dispose();
      this.statTexture?.dispose();
    }
    this.frontMesh.geometry.dispose();
    this.backMesh.geometry.dispose();
    this.edgeMesh.geometry.dispose();
    this.glowMesh.geometry.dispose();
  }
}
