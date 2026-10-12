import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CARD_WIDTH, CARD_HEIGHT, getZonePosition } from './constants';
import { CardMesh } from './card-mesh';
import type { CardDatabase } from '../engine/card-database';
import { LOCATION, POS } from '../engine/constants';
import { createZoneTexture, type ZoneType } from './zone-texture';
import { getFieldMatTexture } from './field-texture';
import { getCardBackTexture, createCardFrontTexture, setCardBackSource } from './card-texture';
import type { BoardCardSnapshot } from '../engine/duel-runner';
import { customAssets } from '../ui/custom-assets';

export interface BoardCallbacks {
  onCardHover?: (card: CardMesh | null) => void;
  onCardClick?: (card: CardMesh) => void;
  onZoneClick?: (player: number, location: number, sequence: number) => void;
  onMateClick?: () => void;
  onExtraDeckHover?: (hovering: boolean, player: number) => void;
  onExtraDeckClick?: (player: number) => void;
}

export class ThreeBoard {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  private cards = new Map<string, CardMesh>();
  private cardDb?: CardDatabase;
  private callbacks: BoardCallbacks = {};

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private hoveredCard: CardMesh | null = null;
  private hoveringExtraDeck = false;
  private zoneMeshes: THREE.Mesh[] = [];
  private deckStackMeshes: THREE.Mesh[] = [];
  private p0ExtraMesh: THREE.Mesh | null = null;
  private p0ExtraGlowGroup: THREE.Group | null = null;
  private zoneHighlightGroup: THREE.Group | null = null;

  private p0FloorMat?: THREE.MeshStandardMaterial;
  private p1FloorMat?: THREE.MeshStandardMaterial;
  private mateGroup: THREE.Group | null = null;
  private mateFigure: THREE.Object3D | null = null;
  private mateRing: THREE.Mesh | null = null;
  private mateMixer: THREE.AnimationMixer | null = null;
  private mateBaseScale = 1.6;
  private mateBaseY = 1.05;
  private mateBounceProgress = 0;
  private stadiumCrystals: THREE.Mesh[] = [];
  private ambientParticles: THREE.Points | null = null;
  private particlePositions: Float32Array | null = null;
  private currentFieldIcon = 'FieldIcon1090001.png';
  private clock = new THREE.Clock();

  constructor(container: HTMLElement, cardDb?: CardDatabase, callbacks?: BoardCallbacks) {
    this.container = container;
    this.cardDb = cardDb;
    this.callbacks = callbacks ?? {};

    // 1. Scene setup com Fog atmosférico do Master Duel
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060812);
    this.scene.fog = new THREE.FogExp2(0x060812, 0.038);

    // 2. Camera setup - Ângulo cinemático do Master Duel (Screenshot 3)
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    this.camera.position.set(0, 6.75, 7.15);
    this.camera.lookAt(0, -0.2, 0.55);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    // 4. Lights & Arena Environment
    this.setupLighting();
    this.createBoardEnvironment();
    this.createZoneFrames();
    this.create3DDecks();

    // 5. Interações & Loop de Animação
    this.setupInteraction();
    this.animate();
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0xdde8ff, 1.25);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x88b0e0, 0x181c2c, 1.85);
    this.scene.add(hemi);

    const mainSun = new THREE.DirectionalLight(0xffffff, 2.6);
    mainSun.position.set(0, 14, 6);
    mainSun.castShadow = true;
    mainSun.shadow.mapSize.width = 2048;
    mainSun.shadow.mapSize.height = 2048;
    mainSun.shadow.camera.near = 0.5;
    mainSun.shadow.camera.far = 30;
    mainSun.shadow.camera.left = -8;
    mainSun.shadow.camera.right = 8;
    mainSun.shadow.camera.top = 8;
    mainSun.shadow.camera.bottom = -8;
    this.scene.add(mainSun);

    const p0Spot = new THREE.SpotLight(0x00e5ff, 3.8, 20, Math.PI / 3.8, 0.45);
    p0Spot.position.set(0, 8, 5.2);
    p0Spot.target.position.set(0, 0, 1.8);
    this.scene.add(p0Spot);
    this.scene.add(p0Spot.target);

    const p1Spot = new THREE.SpotLight(0xff3366, 3.8, 20, Math.PI / 3.8, 0.45);
    p1Spot.position.set(0, 8, -5.2);
    p1Spot.target.position.set(0, 0, -1.8);
    this.scene.add(p1Spot);
    this.scene.add(p1Spot.target);
  }

  private createBoardEnvironment() {
    // 1. Player P0 Arena Floor (Top surface)
    const p0FloorGeo = new THREE.PlaneGeometry(12.4, 6.2);
    this.p0FloorMat = new THREE.MeshStandardMaterial({
      map: getFieldMatTexture(true, this.currentFieldIcon),
      roughness: 0.48,
      metalness: 0.18,
      emissive: new THREE.Color(0x001829),
      emissiveIntensity: 0.28,
    });
    const p0Floor = new THREE.Mesh(p0FloorGeo, this.p0FloorMat);
    p0Floor.rotation.x = -Math.PI / 2;
    p0Floor.position.set(0, 0.005, 3.1);
    p0Floor.receiveShadow = true;
    this.scene.add(p0Floor);

    // 2. Opponent P1 Arena Floor (Top surface)
    const p1FloorGeo = new THREE.PlaneGeometry(12.4, 6.2);
    this.p1FloorMat = new THREE.MeshStandardMaterial({
      map: getFieldMatTexture(false, this.currentFieldIcon),
      roughness: 0.48,
      metalness: 0.18,
      emissive: new THREE.Color(0x22060e),
      emissiveIntensity: 0.28,
    });
    const p1Floor = new THREE.Mesh(p1FloorGeo, this.p1FloorMat);
    p1Floor.rotation.x = -Math.PI / 2;
    p1Floor.position.set(0, 0.005, -3.1);
    p1Floor.receiveShadow = true;
    this.scene.add(p1Floor);

    // 3. Multi-tier Solid 3D Elevated Arena Platform
    const upperGeo = new THREE.BoxGeometry(13.1, 0.24, 12.8);
    const upperMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e29,
      roughness: 0.45,
      metalness: 0.65,
    });
    const upperArena = new THREE.Mesh(upperGeo, upperMat);
    upperArena.position.set(0, -0.115, 0);
    upperArena.receiveShadow = true;
    this.scene.add(upperArena);

    const lowerGeo = new THREE.BoxGeometry(14.6, 0.45, 14.0);
    const lowerMat = new THREE.MeshStandardMaterial({
      color: 0x0b0e17,
      roughness: 0.6,
      metalness: 0.5,
    });
    const lowerArena = new THREE.Mesh(lowerGeo, lowerMat);
    lowerArena.position.set(0, -0.44, 0);
    lowerArena.receiveShadow = true;
    this.scene.add(lowerArena);

    // Perimeter Glowing Energy Conduits
    const p0NeonGeo = new THREE.BoxGeometry(13.15, 0.04, 0.08);
    const p0NeonMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const p0Neon = new THREE.Mesh(p0NeonGeo, p0NeonMat);
    p0Neon.position.set(0, 0.01, 6.42);
    this.scene.add(p0Neon);

    const p1NeonGeo = new THREE.BoxGeometry(13.15, 0.04, 0.08);
    const p1NeonMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
    const p1Neon = new THREE.Mesh(p1NeonGeo, p1NeonMat);
    p1Neon.position.set(0, 0.01, -6.42);
    this.scene.add(p1Neon);

    // 4. Linha divisória central
    const railGeo = new THREE.PlaneGeometry(12.0, 0.08);
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x38e8ff,
      transparent: true,
      opacity: 0.75,
    });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.rotation.x = -Math.PI / 2;
    rail.position.set(0, 0.007, 0);
    this.scene.add(rail);

    // 5. Circular Graveyard & Banished Stone Portals (Screenshot 3)
    const makeCircularPortal = (x: number, z: number, isBanish: boolean) => {
      const portalGroup = new THREE.Group();
      portalGroup.position.set(x, 0.015, z);

      const outerGeo = new THREE.CylinderGeometry(0.55, 0.62, 0.06, 28);
      const outerMat = new THREE.MeshStandardMaterial({
        color: 0x3b3f4a,
        roughness: 0.65,
        metalness: 0.35,
      });
      const outerRing = new THREE.Mesh(outerGeo, outerMat);
      outerRing.position.y = 0.02;
      portalGroup.add(outerRing);

      const vortexGeo = new THREE.CircleGeometry(0.42, 28);
      const vortexMat = new THREE.MeshBasicMaterial({
        color: isBanish ? 0x7c4dff : 0xb03060,
        transparent: true,
        opacity: 0.8,
      });
      const vortex = new THREE.Mesh(vortexGeo, vortexMat);
      vortex.rotation.x = -Math.PI / 2;
      vortex.position.y = 0.052;
      portalGroup.add(vortex);

      const glowRingGeo = new THREE.RingGeometry(0.36, 0.45, 28);
      const glowRingMat = new THREE.MeshBasicMaterial({
        color: isBanish ? 0x00e5ff : 0xff4081,
        side: THREE.DoubleSide,
      });
      const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
      glowRing.rotation.x = -Math.PI / 2;
      glowRing.position.y = 0.055;
      portalGroup.add(glowRing);

      this.scene.add(portalGroup);
    };

    const p0Grave = getZonePosition(0, LOCATION.GRAVE, 0);
    const p0Banish = getZonePosition(0, LOCATION.REMOVED, 0);
    const p1Grave = getZonePosition(1, LOCATION.GRAVE, 0);
    const p1Banish = getZonePosition(1, LOCATION.REMOVED, 0);
    makeCircularPortal(p0Grave.x, p0Grave.z, false);
    makeCircularPortal(p0Banish.x, p0Banish.z, true);
    makeCircularPortal(p1Grave.x, p1Grave.z, false);
    makeCircularPortal(p1Banish.x, p1Banish.z, true);

    // 6. 3D Physical Trays for Main Deck and Extra Deck
    const makeZoneTray = (x: number, z: number, isP0: boolean) => {
      const trayGeo = new THREE.BoxGeometry(CARD_WIDTH * 1.15, 0.07, CARD_HEIGHT * 1.15);
      const trayMat = new THREE.MeshStandardMaterial({
        color: isP0 ? 0x162234 : 0x28121c,
        roughness: 0.35,
        metalness: 0.8,
      });
      const tray = new THREE.Mesh(trayGeo, trayMat);
      tray.position.set(x, 0.035, z);
      tray.receiveShadow = true;
      this.scene.add(tray);

      const rimGeo = new THREE.BoxGeometry(CARD_WIDTH * 1.18, 0.02, CARD_HEIGHT * 1.18);
      const rimMat = new THREE.MeshStandardMaterial({
        color: isP0 ? 0xd4af37 : 0x882233,
        roughness: 0.25,
        metalness: 0.85,
      });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(x, 0.075, z);
      this.scene.add(rim);
    };

    const p0Deck = getZonePosition(0, LOCATION.DECK, 0);
    const p0Extra = getZonePosition(0, LOCATION.EXTRA, 0);
    const p1Deck = getZonePosition(1, LOCATION.DECK, 0);
    const p1Extra = getZonePosition(1, LOCATION.EXTRA, 0);
    makeZoneTray(p0Deck.x, p0Deck.z, true);
    makeZoneTray(p0Extra.x, p0Extra.z, true);
    makeZoneTray(p1Deck.x, p1Deck.z, false);
    makeZoneTray(p1Extra.x, p1Extra.z, false);

    // 7. Ambient Floating Energy Particle Motes
    const particleCount = 100;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = 0.2 + Math.random() * 3.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particlePositions = positions;
    const particleMat = new THREE.PointsMaterial({
      color: 0x00e5ff,
      size: 0.045,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    this.ambientParticles = new THREE.Points(geometry, particleMat);
    this.scene.add(this.ambientParticles);
  }

  private createZoneFrames() {
    const w = CARD_WIDTH * 1.06;
    const h = CARD_HEIGHT * 1.06;
    const depth = 0.012;

    const make3DZone = (
      x: number,
      z: number,
      type: ZoneType,
      player: number,
      loc: number,
      seq: number
    ) => {
      const isP0 = player === 0;
      const topTex = createZoneTexture(type, isP0);

      const edgeMat = new THREE.MeshStandardMaterial({
        color: isP0 ? 0x162436 : 0x261218,
        roughness: 0.4,
        metalness: 0.75,
      });

      const topMat = new THREE.MeshStandardMaterial({
        map: topTex,
        roughness: 0.28,
        metalness: 0.45,
        emissive: isP0 && type === 'spell' ? new THREE.Color(0x004466) : new THREE.Color(0x111520),
        emissiveIntensity: isP0 && type === 'spell' ? 0.65 : 0.25,
      });

      const materials = [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat];
      const geo = new THREE.BoxGeometry(w, depth, h);
      const mesh = new THREE.Mesh(geo, materials);
      mesh.position.set(x, depth / 2, z);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.userData = { isZone: true, player, location: loc, sequence: seq };

      this.scene.add(mesh);
      this.zoneMeshes.push(mesh);
    };

    // Player 0 (Bottom): Monster & Spell Zones
    for (let i = 0; i < 5; i++) {
      const mz = getZonePosition(0, LOCATION.MZONE, i);
      make3DZone(mz.x, mz.z, 'monster', 0, LOCATION.MZONE, i);

      const sz = getZonePosition(0, LOCATION.SZONE, i);
      make3DZone(sz.x, sz.z, 'spell', 0, LOCATION.SZONE, i);
    }
    const p0Deck = getZonePosition(0, LOCATION.DECK, 0);
    make3DZone(p0Deck.x, p0Deck.z, 'deck', 0, LOCATION.DECK, 0);
    const p0Grave = getZonePosition(0, LOCATION.GRAVE, 0);
    make3DZone(p0Grave.x, p0Grave.z, 'grave', 0, LOCATION.GRAVE, 0);
    const p0Extra = getZonePosition(0, LOCATION.EXTRA, 0);
    make3DZone(p0Extra.x, p0Extra.z, 'extra', 0, LOCATION.EXTRA, 0);
    const p0Banish = getZonePosition(0, LOCATION.REMOVED, 0);
    make3DZone(p0Banish.x, p0Banish.z, 'banish', 0, LOCATION.REMOVED, 0);
    const p0Field = getZonePosition(0, LOCATION.SZONE, 5);
    make3DZone(p0Field.x, p0Field.z, 'field', 0, LOCATION.SZONE, 5);

    // Player 1 (Top): Monster & Spell Zones
    for (let i = 0; i < 5; i++) {
      const mz = getZonePosition(1, LOCATION.MZONE, i);
      make3DZone(mz.x, mz.z, 'monster', 1, LOCATION.MZONE, i);

      const sz = getZonePosition(1, LOCATION.SZONE, i);
      make3DZone(sz.x, sz.z, 'spell', 1, LOCATION.SZONE, i);
    }
    const p1Deck = getZonePosition(1, LOCATION.DECK, 0);
    make3DZone(p1Deck.x, p1Deck.z, 'deck', 1, LOCATION.DECK, 0);
    const p1Grave = getZonePosition(1, LOCATION.GRAVE, 0);
    make3DZone(p1Grave.x, p1Grave.z, 'grave', 1, LOCATION.GRAVE, 0);
    const p1Extra = getZonePosition(1, LOCATION.EXTRA, 0);
    make3DZone(p1Extra.x, p1Extra.z, 'extra', 1, LOCATION.EXTRA, 0);
    const p1Banish = getZonePosition(1, LOCATION.REMOVED, 0);
    make3DZone(p1Banish.x, p1Banish.z, 'banish', 1, LOCATION.REMOVED, 0);
    const p1Field = getZonePosition(1, LOCATION.SZONE, 5);
    make3DZone(p1Field.x, p1Field.z, 'field', 1, LOCATION.SZONE, 5);

    // Extra Monster Zones (Center)
    make3DZone(-1.3, 0, 'emz', 0, LOCATION.MZONE, 5);
    make3DZone(1.3, 0, 'emz', 0, LOCATION.MZONE, 6);
  }

  private create3DDecks() {
    const cardBack = getCardBackTexture();
    const makeStackMats = () => {
      const sideMat = new THREE.MeshStandardMaterial({
        color: 0xe0d7c5,
        roughness: 0.9,
      });
      const topMat = new THREE.MeshStandardMaterial({
        map: cardBack,
        roughness: 0.4,
        metalness: 0.1,
      });
      return [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    };

    // Player 0 Main Deck
    const p0DeckPos = getZonePosition(0, LOCATION.DECK, 0);
    const p0DeckMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.35, CARD_HEIGHT), makeStackMats());
    p0DeckMesh.position.set(p0DeckPos.x, 0.175 + 0.035, p0DeckPos.z);
    p0DeckMesh.castShadow = true;
    this.scene.add(p0DeckMesh);
    this.deckStackMeshes.push(p0DeckMesh);

    // Player 0 Extra Deck
    const p0ExtraPos = getZonePosition(0, LOCATION.EXTRA, 0);
    const p0ExtraMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.16, CARD_HEIGHT), makeStackMats());
    p0ExtraMesh.position.set(p0ExtraPos.x, 0.08 + 0.035, p0ExtraPos.z);
    p0ExtraMesh.castShadow = true;
    p0ExtraMesh.userData = { isExtraDeck: true, player: 0 };
    this.scene.add(p0ExtraMesh);
    this.p0ExtraMesh = p0ExtraMesh;
    this.deckStackMeshes.push(p0ExtraMesh);

    // Golden Aura Group around Player 0 Extra Deck (for `extra deck.png`)
    this.p0ExtraGlowGroup = new THREE.Group();
    this.p0ExtraGlowGroup.position.set(p0ExtraPos.x, 0.12, p0ExtraPos.z);
    const glowFrameGeo = new THREE.PlaneGeometry(CARD_WIDTH * 1.28, CARD_HEIGHT * 1.28);
    const glowFrameMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const glowFrame = new THREE.Mesh(glowFrameGeo, glowFrameMat);
    glowFrame.rotation.x = -Math.PI / 2;
    this.p0ExtraGlowGroup.add(glowFrame);
    this.p0ExtraGlowGroup.visible = false;
    this.scene.add(this.p0ExtraGlowGroup);

    // Player 1 Main Deck
    const p1DeckPos = getZonePosition(1, LOCATION.DECK, 0);
    const p1DeckMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.35, CARD_HEIGHT), makeStackMats());
    p1DeckMesh.position.set(p1DeckPos.x, 0.175 + 0.035, p1DeckPos.z);
    p1DeckMesh.rotation.y = Math.PI;
    p1DeckMesh.castShadow = true;
    this.scene.add(p1DeckMesh);
    this.deckStackMeshes.push(p1DeckMesh);

    // Player 1 Extra Deck
    const p1ExtraPos = getZonePosition(1, LOCATION.EXTRA, 0);
    const p1ExtraMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.16, CARD_HEIGHT), makeStackMats());
    p1ExtraMesh.position.set(p1ExtraPos.x, 0.08 + 0.035, p1ExtraPos.z);
    p1ExtraMesh.rotation.y = Math.PI;
    p1ExtraMesh.castShadow = true;
    this.scene.add(p1ExtraMesh);
    this.deckStackMeshes.push(p1ExtraMesh);
  }

  public setExtraDeckGlow(active: boolean) {
    if (this.p0ExtraGlowGroup) {
      this.p0ExtraGlowGroup.visible = active;
    }
  }

  public getExtraDeckScreenPosition(player = 0): { x: number; y: number } {
    const pos = getZonePosition(player, LOCATION.EXTRA, 0);
    const vector = new THREE.Vector3(pos.x, 0.35, pos.z);
    vector.project(this.camera);

    const widthHalf = (this.container.clientWidth || window.innerWidth) / 2;
    const heightHalf = (this.container.clientHeight || window.innerHeight) / 2;

    return {
      x: vector.x * widthHalf + widthHalf,
      y: -(vector.y * heightHalf) + heightHalf,
    };
  }

  /**
   * Highlights selectable 3D board zones with Master Duel yellow-green target borders (`selecionar posição no field.png`)
   */
  public highlightSelectableZones(places: Array<{ player: number; location: number; sequence: number }>) {
    this.clearZoneHighlights();
    this.zoneHighlightGroup = new THREE.Group();

    const w = CARD_WIDTH * 1.12;
    const h = CARD_HEIGHT * 1.12;

    for (const p of places) {
      const zoneMesh = this.zoneMeshes.find(
        (zm) =>
          zm.userData.player === p.player &&
          zm.userData.location === p.location &&
          zm.userData.sequence === p.sequence
      );
      const pos = zoneMesh
        ? { x: zoneMesh.position.x, z: zoneMesh.position.z }
        : getZonePosition(p.player, p.location, p.sequence);

      // Outer glowing yellow-green border
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 356;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 356);

      ctx.fillStyle = 'rgba(180, 255, 0, 0.22)';
      ctx.fillRect(10, 10, 236, 336);

      ctx.shadowColor = '#c8ff00';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = '#d4ff00';
      ctx.lineWidth = 10;
      ctx.strokeRect(10, 10, 236, 336);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.strokeRect(22, 22, 212, 312);

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(pos.x, 0.032, pos.z);
      mesh.userData = { isZone: true, player: p.player, location: p.location, sequence: p.sequence };
      this.zoneHighlightGroup.add(mesh);
    }

    this.scene.add(this.zoneHighlightGroup);
  }

  public clearZoneHighlights() {
    if (this.zoneHighlightGroup) {
      this.scene.remove(this.zoneHighlightGroup);
      this.zoneHighlightGroup = null;
    }
  }

  private setupInteraction() {
    window.addEventListener('resize', this.onResize);
    this.container.addEventListener('mousemove', this.onMouseMove);
    this.container.addEventListener('click', this.onClick);
  }

  private onResize = () => {
    if (!this.container) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Check Extra Deck Hover first
    if (this.p0ExtraMesh) {
      const extraHit = this.raycaster.intersectObject(this.p0ExtraMesh, false);
      const isHoveringExtra = extraHit.length > 0;
      if (isHoveringExtra !== this.hoveringExtraDeck) {
        this.hoveringExtraDeck = isHoveringExtra;
        this.callbacks.onExtraDeckHover?.(isHoveringExtra, 0);
      }
    }

    const cardObjects = Array.from(this.cards.values()).map((c) => c.group);
    const intersects = this.raycaster.intersectObjects(cardObjects, true);

    if (intersects.length > 0) {
      let root: THREE.Object3D | null = intersects[0].object;
      while (root && !root.userData.card) {
        root = root.parent;
      }
      const card = root?.userData.card as CardMesh | undefined;
      if (card && card !== this.hoveredCard) {
        this.hoveredCard?.setHover(false);
        this.hoveredCard = card;
        this.hoveredCard.setHover(true);
        this.callbacks.onCardHover?.(this.hoveredCard);
      }
    } else if (this.hoveredCard) {
      this.hoveredCard.setHover(false);
      this.hoveredCard = null;
      this.callbacks.onCardHover?.(null);
    }
  };

  private onClick = () => {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // 1. Check highlighted zone meshes first if zone selection is active
    if (this.zoneHighlightGroup) {
      const hlIntersects = this.raycaster.intersectObjects(this.zoneHighlightGroup.children, false);
      if (hlIntersects.length > 0) {
        const data = hlIntersects[0].object.userData;
        if (data.isZone) {
          this.callbacks.onZoneClick?.(data.player, data.location, data.sequence);
          return;
        }
      }
    }

    // 2. Check Player 0 Extra Deck stack click
    if (this.p0ExtraMesh) {
      const extraHit = this.raycaster.intersectObject(this.p0ExtraMesh, false);
      if (extraHit.length > 0) {
        this.callbacks.onExtraDeckClick?.(0);
        return;
      }
    }

    // 3. Check 3D cards
    const cardObjects = Array.from(this.cards.values()).map((c) => c.group);
    const intersects = this.raycaster.intersectObjects(cardObjects, true);

    if (intersects.length > 0) {
      let root: THREE.Object3D | null = intersects[0].object;
      while (root && !root.userData.card) {
        root = root.parent;
      }
      const card = root?.userData.card as CardMesh | undefined;
      if (card) {
        this.callbacks.onCardClick?.(card);
        return;
      }
    }

    // 4. Check Mate Click
    if (this.mateGroup) {
      const mateIntersects = this.raycaster.intersectObjects(this.mateGroup.children, true);
      if (mateIntersects.length > 0) {
        this.mateBounceProgress = 1.0;
        this.callbacks.onMateClick?.();
        return;
      }
    }

    // 5. Check zones
    const zoneIntersects = this.raycaster.intersectObjects(this.zoneMeshes, false);
    if (zoneIntersects.length > 0) {
      const data = zoneIntersects[0].object.userData;
      if (data.isZone) {
        if (data.player === 0 && data.location === LOCATION.EXTRA) {
          this.callbacks.onExtraDeckClick?.(0);
        }
        this.callbacks.onZoneClick?.(data.player, data.location, data.sequence);
      }
    }
  };

  private animate = () => {
    requestAnimationFrame(this.animate);
    const delta = this.clock.getDelta();
    const now = Date.now();

    if (this.mateMixer) {
      this.mateMixer.update(delta);
    }

    // 1. Animate 3D Mate (Breathing, bobbing, and click-bounce)
    if (this.mateFigure) {
      const s = this.mateBaseScale;
      const baseY = this.mateBaseY;
      if (this.mateBounceProgress > 0) {
        this.mateBounceProgress -= 0.035;
        const p = 1.0 - this.mateBounceProgress;
        const jumpY = Math.sin(p * Math.PI) * 0.45;
        this.mateFigure.position.y = baseY + jumpY;
        this.mateFigure.rotation.y = 0.35 + p * Math.PI * 2;
        this.mateFigure.scale.set(s, s * (1 + Math.sin(p * Math.PI) * 0.15), s);
      } else {
        this.mateBounceProgress = 0;
        this.mateFigure.position.y = baseY + Math.sin(now * 0.0025) * 0.04;
        this.mateFigure.rotation.y = 0.35 + Math.sin(now * 0.0012) * 0.08;
        const breath = 1 + Math.sin(now * 0.003) * 0.02;
        this.mateFigure.scale.set(s, s * breath, s);
      }
    }
    if (this.mateRing) {
      this.mateRing.rotation.z += 0.008;
    }

    // 2. Pulse Extra Deck Golden Glow if active
    if (this.p0ExtraGlowGroup && this.p0ExtraGlowGroup.visible) {
      const pulse = 1 + Math.sin(now * 0.006) * 0.08;
      this.p0ExtraGlowGroup.scale.set(pulse, 1, pulse);
    }

    // 3. Pulse Selectable Zone Highlights if active
    if (this.zoneHighlightGroup) {
      const pulse = 0.75 + Math.sin(now * 0.008) * 0.25;
      this.zoneHighlightGroup.children.forEach((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        if (m) m.opacity = pulse;
      });
    }

    // 4. Animate Floating Crystals
    for (let i = 0; i < this.stadiumCrystals.length; i++) {
      const crystal = this.stadiumCrystals[i];
      crystal.rotation.y += 0.012;
      crystal.position.y = crystal.userData.baseY + Math.sin(now * 0.002 + i) * 0.06;
    }

    // 5. Animate Ambient Energy Particles
    if (this.ambientParticles && this.particlePositions) {
      const positions = this.ambientParticles.geometry.attributes.position.array as Float32Array;
      const count = positions.length / 3;
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] += 0.003;
        positions[i * 3] += Math.sin(now * 0.001 + i) * 0.002;
        if (positions[i * 3 + 1] > 3.8) {
          positions[i * 3 + 1] = 0.2;
        }
      }
      this.ambientParticles.geometry.attributes.position.needsUpdate = true;
    }

    this.renderer.render(this.scene, this.camera);
  };

  addOrMoveCard(
    id: string,
    code: number,
    player: number,
    location: number,
    sequence: number,
    position: number = POS.FACEUP_ATTACK
  ): CardMesh {
    let card = this.cards.get(id);
    if (!card) {
      const cardData = this.cardDb?.getCard(code) ?? null;
      card = new CardMesh(code, cardData);
      card.location = location;
      card.sequence = sequence;
      card.controller = player;
      card.position = position;

      this.scene.add(card.group);
      this.cards.set(id, card);

      const deckPos = getZonePosition(player, LOCATION.DECK, 0);
      card.setWorldTransform(deckPos, { x: Math.PI / 2, y: 0, z: 0 }, false);
    }

    card.location = location;
    card.sequence = sequence;
    card.controller = player;

    if (location === LOCATION.HAND) {
      this.layoutHand(player);
    } else {
      const targetPos = getZonePosition(player, location, sequence);
      card.setWorldTransform(targetPos, undefined, true);
      card.setBattlePosition(position, true);
    }

    return card;
  }

  moveCard(
    code: number,
    fromPlayer: number,
    fromLoc: number,
    fromSeq: number,
    toPlayer: number,
    toLoc: number,
    toSeq: number,
    toPos: number = POS.FACEUP_ATTACK
  ): CardMesh {
    let candidate: CardMesh | undefined;
    for (const card of this.cards.values()) {
      if (
        card.controller === fromPlayer &&
        card.location === fromLoc &&
        (card.sequence === fromSeq || (code > 0 && card.code === code))
      ) {
        candidate = card;
        break;
      }
    }

    if (!candidate) {
      const id = `card_${Date.now()}_${Math.random()}`;
      return this.addOrMoveCard(id, code, toPlayer, toLoc, toSeq, toPos);
    }

    candidate.controller = toPlayer;
    candidate.location = toLoc;
    candidate.sequence = toSeq;
    candidate.position = toPos;
    if (code > 0 && candidate.code !== code) {
      candidate.code = code;
      candidate.cardData = this.cardDb?.getCard(code) ?? null;
      const newFront = createCardFrontTexture(candidate.cardData, code);
      (candidate.frontMesh.material as THREE.MeshStandardMaterial).map = newFront;
      (candidate.frontMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }

    if (toLoc === LOCATION.HAND) {
      this.layoutHand(toPlayer);
    } else {
      const targetPos = getZonePosition(toPlayer, toLoc, toSeq);
      candidate.setWorldTransform(targetPos, undefined, true, 0.45);
      candidate.setBattlePosition(toPos, true);
    }

    if (fromLoc === LOCATION.HAND) {
      for (const card of this.cards.values()) {
        if (
          card !== candidate &&
          card.controller === fromPlayer &&
          card.location === LOCATION.HAND &&
          card.sequence > fromSeq
        ) {
          card.sequence -= 1;
        }
      }
      this.layoutHand(fromPlayer);
    }

    return candidate;
  }

  layoutHand(player: number) {
    const handCards = Array.from(this.cards.values())
      .filter((c) => c.controller === player && c.location === LOCATION.HAND)
      .sort((a, b) => a.sequence - b.sequence);
    const total = handCards.length;
    if (total === 0) return;

    const spacing = Math.min(0.85, 4.8 / Math.max(total, 1));
    const startX = -((total - 1) * spacing) / 2;

    handCards.forEach((card, idx) => {
      const x = startX + idx * spacing;
      if (player === 0) {
        const z = 4.65 - Math.abs(x) * 0.08;
        const y = 1.12 + idx * 0.015;
        card.setWorldTransform({ x, y, z }, { x: -Math.PI / 3.4, y: 0, z: -x * 0.04 }, true);
      } else {
        const z = -4.35 + Math.abs(x) * 0.08;
        const y = 1.02 + idx * 0.015;
        card.setWorldTransform({ x, y, z }, { x: Math.PI / 4, y: Math.PI, z: x * 0.04 }, true);
      }
    });
  }

  /**
   * Plays a 3D glowing flying card trajectory and destination ring burst when a card moves between zones.
   */
  public playCardTransferAnimation(
    code: number,
    from: { controller: number; location: number; sequence: number },
    to: { controller: number; location: number; sequence: number }
  ) {
    if (!from.location && !to.location) return;
    if (from.location === to.location && from.controller === to.controller && from.sequence === to.sequence) {
      return;
    }

    const startPos = getZonePosition(from.controller ?? 0, from.location || LOCATION.DECK, from.sequence ?? 0);
    const endPos = getZonePosition(to.controller ?? 0, to.location || LOCATION.GRAVE, to.sequence ?? 0);

    let glowColor = 0x00e5ff;
    if (to.location === LOCATION.GRAVE) glowColor = 0xff4081;
    else if (to.location === LOCATION.REMOVED) glowColor = 0x7c4dff;
    else if (to.location === LOCATION.EXTRA) glowColor = 0xffd700;
    else if (to.location === LOCATION.MZONE || to.location === LOCATION.SZONE) glowColor = 0xa8f000;

    // 1. Flying glowing card plane
    const cardData = code > 0 ? (this.cardDb?.getCard(code) ?? null) : null;
    const tex = code > 0 ? createCardFrontTexture(cardData, code) : getCardBackTexture();
    const flyerGeo = new THREE.PlaneGeometry(CARD_WIDTH * 0.92, CARD_HEIGHT * 0.92);
    const flyerMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const flyer = new THREE.Mesh(flyerGeo, flyerMat);
    flyer.rotation.x = -Math.PI / 2;

    // Glowing trail border around flying card
    const borderGeo = new THREE.PlaneGeometry(CARD_WIDTH * 1.16, CARD_HEIGHT * 1.16);
    const borderMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.z = -0.01;
    flyer.add(borderMesh);

    flyer.position.set(startPos.x, startPos.y + 0.25, startPos.z);
    this.scene.add(flyer);

    // 2. Destination impact ring
    const ringGeo = new THREE.RingGeometry(0.18, 0.58, 28);
    const ringMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(endPos.x, 0.09, endPos.z);
    ring.scale.setScalar(0.2);
    this.scene.add(ring);

    const startTime = performance.now();
    const duration = 420;

    const stepTransfer = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);

      const x = startPos.x + (endPos.x - startPos.x) * ease;
      const z = startPos.z + (endPos.z - startPos.z) * ease;
      const arcHeight = Math.sin(t * Math.PI) * 1.35;
      const y = startPos.y + (endPos.y - startPos.y) * ease + 0.22 + arcHeight;

      flyer.position.set(x, y, z);
      flyer.rotation.z = t * Math.PI * 0.5;

      // Expand destination ring as card arrives
      const ringScale = 0.25 + ease * 1.45;
      ring.scale.setScalar(ringScale);
      ringMat.opacity = (1 - t) * 0.9;

      if (t < 1) {
        requestAnimationFrame(stepTransfer);
      } else {
        this.scene.remove(flyer);
        this.scene.remove(ring);
        flyerGeo.dispose();
        flyerMat.dispose();
        borderGeo.dispose();
        borderMat.dispose();
        ringGeo.dispose();
        ringMat.dispose();
      }
    };

    requestAnimationFrame(stepTransfer);
  }

  removeCard(id: string) {
    const card = this.cards.get(id);
    if (card) {
      this.scene.remove(card.group);
      card.dispose();
      this.cards.delete(id);
    }
  }

  clear() {
    for (const card of this.cards.values()) {
      this.scene.remove(card.group);
      card.dispose();
    }
    this.cards.clear();
    this.clearZoneHighlights();
    this.setExtraDeckGlow(false);
  }

  getScreenPosition(card: CardMesh): { x: number; y: number } {
    const vector = new THREE.Vector3();
    card.group.getWorldPosition(vector);
    vector.y += 0.25;
    vector.project(this.camera);

    const widthHalf = (this.container.clientWidth || window.innerWidth) / 2;
    const heightHalf = (this.container.clientHeight || window.innerHeight) / 2;

    return {
      x: vector.x * widthHalf + widthHalf,
      y: -(vector.y * heightHalf) + heightHalf,
    };
  }

  getCards(): CardMesh[] {
    return Array.from(this.cards.values());
  }

  findCard(player: number, location: number, sequence: number): CardMesh | undefined {
    for (const card of this.cards.values()) {
      if (card.controller === player && card.location === location && card.sequence === sequence) {
        return card;
      }
    }
    return undefined;
  }

  setField(fieldIcon: string) {
    this.currentFieldIcon = fieldIcon || 'FieldIcon1090001.png';
    const p0Tex = getFieldMatTexture(true, this.currentFieldIcon);
    const p1Tex = getFieldMatTexture(false, this.currentFieldIcon);
    if (this.p0FloorMat) {
      this.p0FloorMat.map = p0Tex;
      this.p0FloorMat.needsUpdate = true;
    }
    if (this.p1FloorMat) {
      this.p1FloorMat.map = p1Tex;
      this.p1FloorMat.needsUpdate = true;
    }
  }

  setProtector(protector: string) {
    setCardBackSource(protector || 'classic');
    const backTex = getCardBackTexture();
    for (const mesh of this.deckStackMeshes) {
      const mats = mesh.material as THREE.MeshStandardMaterial[];
      if (mats && mats[2]) {
        mats[2].map = backTex;
        mats[2].needsUpdate = true;
      }
    }
  }

  setMate(mateIcon: string) {
    if (this.mateGroup) {
      this.scene.remove(this.mateGroup);
      this.mateGroup = null;
      this.mateFigure = null;
      this.mateRing = null;
      this.mateMixer = null;
    }
    if (!mateIcon) return;

    this.mateGroup = new THREE.Group();
    this.mateGroup.position.set(-4.9, 0, 1.55);

    // 1. Square Carved Stone Mate Platform with 4 Purple Glowing Corner Crystals (Screenshot 3)
    const baseGeo = new THREE.BoxGeometry(1.75, 0.16, 1.75);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x3b3f4a,
      roughness: 0.65,
      metalness: 0.35,
    });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = 0.08;
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    this.mateGroup.add(baseMesh);

    // Inner stone inlay
    const innerGeo = new THREE.BoxGeometry(1.42, 0.18, 1.42);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x262a34,
      roughness: 0.55,
      metalness: 0.45,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.y = 0.09;
    innerMesh.receiveShadow = true;
    this.mateGroup.add(innerMesh);

    // 4 Purple Glowing Corner Crystals on Mate Platform (Screenshot 3)
    const crystalCorners = [
      { x: -0.72, z: -0.72 },
      { x: 0.72, z: -0.72 },
      { x: -0.72, z: 0.72 },
      { x: 0.72, z: 0.72 },
    ];
    crystalCorners.forEach((cPos) => {
      const cGeo = new THREE.OctahedronGeometry(0.14, 0);
      const cMat = new THREE.MeshStandardMaterial({
        color: 0xb388ff,
        emissive: new THREE.Color(0x7c4dff),
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.8,
      });
      const crystal = new THREE.Mesh(cGeo, cMat);
      crystal.scale.set(0.8, 1.6, 0.8);
      crystal.position.set(cPos.x, 0.24, cPos.z);
      crystal.userData = { baseY: 0.24 };
      this.mateGroup!.add(crystal);
      this.stadiumCrystals.push(crystal);
    });

    // Rotating Cyan Energy Ring on Pedestal
    const ringGeo = new THREE.TorusGeometry(0.58, 0.02, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: new THREE.Color(0x00e5ff),
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.mateRing = new THREE.Mesh(ringGeo, ringMat);
    this.mateRing.rotation.x = Math.PI / 2;
    this.mateRing.position.y = 0.19;
    this.mateGroup.add(this.mateRing);

    // 2. Load Custom 3D .GLB Mate or PNG Cutout Mate
    if (mateIcon === 'custom_mate_glb') {
      const glbUrl = customAssets.getUrl('custom_mate_glb');
      if (glbUrl) {
        const loader = new GLTFLoader();
        loader.load(
          glbUrl,
          (gltf) => {
            if (!this.mateGroup) return;
            const model = gltf.scene;
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z, 0.001);
            const targetScale = 1.45 / maxDim;

            model.scale.setScalar(targetScale);
            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            this.mateBaseScale = targetScale;
            this.mateBaseY = 0.22;
            model.position.set(0, this.mateBaseY, 0);
            model.rotation.y = 0.35;
            this.mateFigure = model;
            this.mateGroup.add(model);

            if (gltf.animations && gltf.animations.length > 0) {
              this.mateMixer = new THREE.AnimationMixer(model);
              const action = this.mateMixer.clipAction(gltf.animations[0]);
              action.play();
            }
          },
          undefined,
          (err) => {
            console.warn('Failed to load custom GLB mate:', err);
          }
        );
        this.scene.add(this.mateGroup);
        return;
      }
    }

    const texUrl =
      mateIcon === 'custom_mate_png'
        ? customAssets.getUrl('custom_mate_png') || '/icon/ProfileFrame1030001_L.png'
        : `/icon/${mateIcon}`;

    const textureLoader = new THREE.TextureLoader();
    const mateTexture = textureLoader.load(texUrl);
    mateTexture.colorSpace = THREE.SRGBColorSpace;

    const figGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const figMat = new THREE.MeshStandardMaterial({
      map: mateTexture,
      transparent: true,
      alphaTest: 0.12,
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    this.mateBaseScale = 1.6;
    this.mateBaseY = 1.02;
    this.mateFigure = new THREE.Mesh(figGeo, figMat);
    this.mateFigure.position.set(0, this.mateBaseY, 0);
    this.mateFigure.rotation.y = 0.35;
    this.mateFigure.castShadow = true;
    this.mateFigure.receiveShadow = true;
    this.mateFigure.userData = { isMate: true };
    this.mateGroup.add(this.mateFigure);

    this.scene.add(this.mateGroup);
  }

  syncSnapshot(snapshot: BoardCardSnapshot[]) {
    const activeKeys = new Set<string>();

    for (const item of snapshot) {
      let card: CardMesh | undefined;

      for (const c of this.cards.values()) {
        if (c.controller === item.player && c.location === item.location && c.sequence === item.sequence) {
          card = c;
          break;
        }
      }

      if (!card && item.code > 0) {
        for (const c of this.cards.values()) {
          if (c.code === item.code && !activeKeys.has(c.id)) {
            card = c;
            break;
          }
        }
      }

      if (!card) {
        const id = `card_${item.player}_${item.location}_${item.sequence}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const cardData = item.code > 0 ? (this.cardDb?.getCard(item.code) ?? null) : null;
        card = new CardMesh(item.code, cardData);
        card.id = id;
        this.scene.add(card.group);
        this.cards.set(id, card);

        const deckPos = getZonePosition(item.player, LOCATION.DECK, 0);
        card.setWorldTransform(deckPos, undefined, false);
      }

      activeKeys.add(card.id);

      card.controller = item.player;
      card.location = item.location;
      card.sequence = item.sequence;
      card.position = item.position;

      const isOpponentSecret =
        item.player === 1 &&
        ((item.location === LOCATION.HAND && (item.position & POS.FACEUP) === 0) ||
          (item.position & POS.FACEDOWN) !== 0);
      card.setFaceHidden(isOpponentSecret);

      if (item.code > 0 && card.code !== item.code) {
        card.code = item.code;
        card.cardData = this.cardDb?.getCard(item.code) ?? null;
        card.updateFrontTexture(card.cardData, item.code);
      }

      card.updateStats(item.attack, item.defense);

      if (item.location !== LOCATION.HAND) {
        const targetPos = getZonePosition(item.player, item.location, item.sequence);
        card.setWorldTransform(targetPos, undefined, true, 0.35);
        card.setBattlePosition(item.position, true);
      }
    }

    for (const [id, c] of this.cards.entries()) {
      if (!activeKeys.has(id)) {
        this.scene.remove(c.group);
        c.dispose();
        this.cards.delete(id);
      }
    }

    this.layoutHand(0);
    this.layoutHand(1);
  }

  clearCardHighlights() {
    for (const card of this.cards.values()) {
      card.setSelectable(false);
      card.setSelected(false);
    }
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.container.removeEventListener('mousemove', this.onMouseMove);
    this.container.removeEventListener('click', this.onClick);
    this.renderer.dispose();
  }
}
