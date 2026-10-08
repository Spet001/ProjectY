import * as THREE from 'three';
import { CARD_WIDTH, CARD_HEIGHT, getZonePosition } from './constants';
import { CardMesh } from './card-mesh';
import type { CardDatabase } from '../engine/card-database';
import { LOCATION, POS } from '../engine/constants';
import { createZoneTexture, type ZoneType } from './zone-texture';
import { getFieldMatTexture } from './field-texture';
import { getCardBackTexture, createCardFrontTexture } from './card-texture';
import type { BoardCardSnapshot } from '../engine/duel-runner';

export interface BoardCallbacks {
  onCardHover?: (card: CardMesh | null) => void;
  onCardClick?: (card: CardMesh) => void;
  onZoneClick?: (player: number, location: number, sequence: number) => void;
  onMateClick?: () => void;
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
  private zoneMeshes: THREE.Mesh[] = [];

  private p0FloorMat?: THREE.MeshStandardMaterial;
  private p1FloorMat?: THREE.MeshStandardMaterial;
  private mateGroup: THREE.Group | null = null;
  private mateFigure: THREE.Mesh | null = null;
  private mateRing: THREE.Mesh | null = null;
  private mateBounceProgress = 0;
  private stadiumCrystals: THREE.Mesh[] = [];
  private ambientParticles: THREE.Points | null = null;
  private particlePositions: Float32Array | null = null;
  private currentFieldIcon = 'FieldIcon1090001.png';

  constructor(container: HTMLElement, cardDb?: CardDatabase, callbacks?: BoardCallbacks) {
    this.container = container;
    this.cardDb = cardDb;
    this.callbacks = callbacks ?? {};

    // 1. Scene setup com Fog atmosférico do Master Duel
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060812);
    this.scene.fog = new THREE.FogExp2(0x060812, 0.04);

    // 2. Camera setup - Ângulo cinemático do Master Duel
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height;

    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 100);
    this.camera.position.set(0, 5.8, 6.2);
    this.camera.lookAt(0, -0.2, 0.4);

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
    // Luz ambiente suave
    const ambient = new THREE.AmbientLight(0xdde8ff, 1.2);
    this.scene.add(ambient);

    // Luz de domo / estádio (Hemisphere)
    const hemi = new THREE.HemisphereLight(0x7da4d4, 0x141828, 1.8);
    this.scene.add(hemi);

    // Holofote principal superior com sombras
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

    // Holofotes de estádio: Azul elétrico no jogador (P0) e Carmesim no oponente (P1)
    const p0Spot = new THREE.SpotLight(0x00e5ff, 4.2, 20, Math.PI / 3.8, 0.4);
    p0Spot.position.set(0, 8, 4.5);
    p0Spot.target.position.set(0, 0, 1.5);
    this.scene.add(p0Spot);
    this.scene.add(p0Spot.target);

    const p1Spot = new THREE.SpotLight(0xff3366, 4.2, 20, Math.PI / 3.8, 0.4);
    p1Spot.position.set(0, 8, -4.5);
    p1Spot.target.position.set(0, 0, -1.5);
    this.scene.add(p1Spot);
    this.scene.add(p1Spot.target);
  }

  private createBoardEnvironment() {
    // 1. Chão de arena do jogador P0 (Top surface)
    const p0FloorGeo = new THREE.PlaneGeometry(12, 5.2);
    this.p0FloorMat = new THREE.MeshStandardMaterial({
      map: getFieldMatTexture(true, this.currentFieldIcon),
      roughness: 0.35,
      metalness: 0.25,
      emissive: new THREE.Color(0x001d33),
      emissiveIntensity: 0.35,
    });
    const p0Floor = new THREE.Mesh(p0FloorGeo, this.p0FloorMat);
    p0Floor.rotation.x = -Math.PI / 2;
    p0Floor.position.set(0, 0.005, 2.6);
    p0Floor.receiveShadow = true;
    this.scene.add(p0Floor);

    // 2. Chão de arena do oponente P1 (Top surface)
    const p1FloorGeo = new THREE.PlaneGeometry(12, 5.2);
    this.p1FloorMat = new THREE.MeshStandardMaterial({
      map: getFieldMatTexture(false, this.currentFieldIcon),
      roughness: 0.35,
      metalness: 0.25,
      emissive: new THREE.Color(0x2d0610),
      emissiveIntensity: 0.35,
    });
    const p1Floor = new THREE.Mesh(p1FloorGeo, this.p1FloorMat);
    p1Floor.rotation.x = -Math.PI / 2;
    p1Floor.position.set(0, 0.005, -2.6);
    p1Floor.receiveShadow = true;
    this.scene.add(p1Floor);

    // 3. Multi-tier Solid 3D Elevated Arena Platform
    // Upper Beveled Tier Slab
    const upperGeo = new THREE.BoxGeometry(12.7, 0.24, 10.9);
    const upperMat = new THREE.MeshStandardMaterial({
      color: 0x090e1c,
      roughness: 0.35,
      metalness: 0.85,
    });
    const upperArena = new THREE.Mesh(upperGeo, upperMat);
    upperArena.position.set(0, -0.115, 0);
    upperArena.receiveShadow = true;
    this.scene.add(upperArena);

    // Lower Stadium Foundation Tier Slab
    const lowerGeo = new THREE.BoxGeometry(14.2, 0.45, 12.2);
    const lowerMat = new THREE.MeshStandardMaterial({
      color: 0x04060c,
      roughness: 0.6,
      metalness: 0.5,
    });
    const lowerArena = new THREE.Mesh(lowerGeo, lowerMat);
    lowerArena.position.set(0, -0.44, 0);
    lowerArena.receiveShadow = true;
    this.scene.add(lowerArena);

    // Perimeter Glowing Energy Conduits
    // P0 Cyan Neon Trim
    const p0NeonGeo = new THREE.BoxGeometry(12.75, 0.04, 0.08);
    const p0NeonMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    const p0Neon = new THREE.Mesh(p0NeonGeo, p0NeonMat);
    p0Neon.position.set(0, 0.01, 5.46);
    this.scene.add(p0Neon);

    // P1 Crimson Neon Trim
    const p1NeonGeo = new THREE.BoxGeometry(12.75, 0.04, 0.08);
    const p1NeonMat = new THREE.MeshBasicMaterial({ color: 0xff3355 });
    const p1Neon = new THREE.Mesh(p1NeonGeo, p1NeonMat);
    p1Neon.position.set(0, 0.01, -5.46);
    this.scene.add(p1Neon);

    // 4. Linha divisória de energia central (Master Duel Center Energy Rail)
    const railGeo = new THREE.PlaneGeometry(12.0, 0.1);
    const railMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.9,
    });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.rotation.x = -Math.PI / 2;
    rail.position.set(0, 0.007, 0);
    this.scene.add(rail);

    const glowRailGeo = new THREE.PlaneGeometry(12.0, 0.35);
    const glowRailMat = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.28,
    });
    const glowRail = new THREE.Mesh(glowRailGeo, glowRailMat);
    glowRail.rotation.x = -Math.PI / 2;
    glowRail.position.set(0, 0.006, 0);
    this.scene.add(glowRail);

    // 5. 3D Architectural Stadium Monoliths at 4 Corners
    const pillarPositions = [
      { x: -8.0, z: 5.6, isP0: true },
      { x: 8.0, z: 5.6, isP0: true },
      { x: -8.0, z: -5.6, isP0: false },
      { x: 8.0, z: -5.6, isP0: false },
    ];
    this.stadiumCrystals = [];

    pillarPositions.forEach((pos) => {
      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(pos.x, -0.4, pos.z);

      // Pillar base
      const pBaseGeo = new THREE.BoxGeometry(1.2, 0.4, 1.2);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x0b101e,
        roughness: 0.4,
        metalness: 0.8,
      });
      const pBase = new THREE.Mesh(pBaseGeo, pMat);
      pBase.position.y = 0.2;
      pillarGroup.add(pBase);

      // Pillar body
      const pBodyGeo = new THREE.CylinderGeometry(0.38, 0.48, 3.2, 6);
      const pBody = new THREE.Mesh(pBodyGeo, pMat);
      pBody.position.y = 1.8;
      pillarGroup.add(pBody);

      // Glowing rune rings around pillar
      const pRingGeo = new THREE.TorusGeometry(0.44, 0.025, 8, 24);
      const pRingMat = new THREE.MeshBasicMaterial({
        color: pos.isP0 ? 0x00e5ff : 0xff3355,
      });
      const pRing1 = new THREE.Mesh(pRingGeo, pRingMat);
      pRing1.rotation.x = Math.PI / 2;
      pRing1.position.y = 1.6;
      pillarGroup.add(pRing1);

      const pRing2 = new THREE.Mesh(pRingGeo, pRingMat);
      pRing2.rotation.x = Math.PI / 2;
      pRing2.position.y = 2.6;
      pillarGroup.add(pRing2);

      // Floating Levitating Beacon Crystal
      const crystalGeo = new THREE.OctahedronGeometry(0.32, 0);
      const crystalMat = new THREE.MeshStandardMaterial({
        color: pos.isP0 ? 0x00e5ff : 0xff3355,
        emissive: pos.isP0 ? new THREE.Color(0x00c8e6) : new THREE.Color(0xe61e38),
        emissiveIntensity: 0.85,
        roughness: 0.15,
        metalness: 0.9,
      });
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.y = 3.9;
      crystal.userData = { baseY: 3.9 };
      pillarGroup.add(crystal);
      this.stadiumCrystals.push(crystal);

      this.scene.add(pillarGroup);
    });

    // 6. 3D Physical Trays for Graveyard and Extra Deck
    const makeZoneTray = (x: number, z: number, isP0: boolean) => {
      const trayGeo = new THREE.BoxGeometry(CARD_WIDTH * 1.15, 0.07, CARD_HEIGHT * 1.15);
      const trayMat = new THREE.MeshStandardMaterial({
        color: isP0 ? 0x091526 : 0x240810,
        roughness: 0.3,
        metalness: 0.85,
      });
      const tray = new THREE.Mesh(trayGeo, trayMat);
      tray.position.set(x, 0.035, z);
      tray.receiveShadow = true;
      this.scene.add(tray);

      // Metallic corner rim
      const rimGeo = new THREE.BoxGeometry(CARD_WIDTH * 1.18, 0.02, CARD_HEIGHT * 1.18);
      const rimMat = new THREE.MeshStandardMaterial({
        color: isP0 ? 0xd4af37 : 0x882233,
        roughness: 0.2,
        metalness: 0.9,
      });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(x, 0.075, z);
      this.scene.add(rim);
    };

    makeZoneTray(4.8, 2.1, true);
    makeZoneTray(-4.8, 2.1, true);
    makeZoneTray(-4.8, -2.1, false);
    makeZoneTray(4.8, -2.1, false);

    // 7. Ambient Floating Energy Particle Motes
    const particleCount = 120;
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
      opacity: 0.65,
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

      // Placa 3D com 6 materiais (laterais metálicas escuras e topo com textura brilhante)
      const edgeMat = new THREE.MeshStandardMaterial({
        color: isP0 ? 0x06182c : 0x24080e,
        roughness: 0.3,
        metalness: 0.85,
      });

      const topMat = new THREE.MeshStandardMaterial({
        map: topTex,
        roughness: 0.2,
        metalness: 0.6,
        emissive: isP0 ? new THREE.Color(0x003355) : new THREE.Color(0x440810),
        emissiveIntensity: 0.5,
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

    // Player 0 (Bottom / Blue): Monster & Spell Zones
    for (let i = 0; i < 5; i++) {
      const mz = getZonePosition(0, LOCATION.MZONE, i);
      make3DZone(mz.x, mz.z, 'monster', 0, LOCATION.MZONE, i);

      const sz = getZonePosition(0, LOCATION.SZONE, i);
      make3DZone(sz.x, sz.z, 'spell', 0, LOCATION.SZONE, i);
    }
    // Player 0 Deck, Grave, Extra, Field, Banished
    const p0Deck = getZonePosition(0, LOCATION.DECK, 0);
    make3DZone(p0Deck.x, p0Deck.z, 'deck', 0, LOCATION.DECK, 0);
    const p0Grave = getZonePosition(0, LOCATION.GRAVE, 0);
    make3DZone(p0Grave.x, p0Grave.z, 'grave', 0, LOCATION.GRAVE, 0);
    const p0Extra = getZonePosition(0, LOCATION.EXTRA, 0);
    make3DZone(p0Extra.x, p0Extra.z, 'extra', 0, LOCATION.EXTRA, 0);
    const p0Banish = getZonePosition(0, LOCATION.REMOVED, 0);
    make3DZone(p0Banish.x, p0Banish.z, 'banish', 0, LOCATION.REMOVED, 0);
    // Player 0 Field Zone (Top-Left of Player 0)
    make3DZone(-3.8, 0.85, 'field', 0, LOCATION.SZONE, 5);

    // Player 1 (Top / Red): Monster & Spell Zones
    for (let i = 0; i < 5; i++) {
      const mz = getZonePosition(1, LOCATION.MZONE, i);
      make3DZone(mz.x, mz.z, 'monster', 1, LOCATION.MZONE, i);

      const sz = getZonePosition(1, LOCATION.SZONE, i);
      make3DZone(sz.x, sz.z, 'spell', 1, LOCATION.SZONE, i);
    }
    // Player 1 Deck, Grave, Extra, Field, Banished
    const p1Deck = getZonePosition(1, LOCATION.DECK, 0);
    make3DZone(p1Deck.x, p1Deck.z, 'deck', 1, LOCATION.DECK, 0);
    const p1Grave = getZonePosition(1, LOCATION.GRAVE, 0);
    make3DZone(p1Grave.x, p1Grave.z, 'grave', 1, LOCATION.GRAVE, 0);
    const p1Extra = getZonePosition(1, LOCATION.EXTRA, 0);
    make3DZone(p1Extra.x, p1Extra.z, 'extra', 1, LOCATION.EXTRA, 0);
    const p1Banish = getZonePosition(1, LOCATION.REMOVED, 0);
    make3DZone(p1Banish.x, p1Banish.z, 'banish', 1, LOCATION.REMOVED, 0);
    // Player 1 Field Zone (Top-Right of Player 1)
    make3DZone(3.8, -0.85, 'field', 1, LOCATION.SZONE, 5);

    // Extra Monster Zones (Center - Emerald / Gold)
    make3DZone(-1.3, 0, 'emz', 0, LOCATION.MZONE, 5);
    make3DZone(1.3, 0, 'emz', 0, LOCATION.MZONE, 6);
  }

  /**
   * Renderiza maços de cartas 3D volumétricos nos Decks de ambos os jogadores
   */
  private create3DDecks() {
    const cardBack = getCardBackTexture();
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0xe0d7c5,
      roughness: 0.9,
    });
    const topMat = new THREE.MeshStandardMaterial({
      map: cardBack,
      roughness: 0.4,
      metalness: 0.1,
    });
    const deckMats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];

    // Player 0 Main Deck (40 cartas = ~0.35m de altura)
    const p0DeckPos = getZonePosition(0, LOCATION.DECK, 0);
    const p0DeckMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.35, CARD_HEIGHT), deckMats);
    p0DeckMesh.position.set(p0DeckPos.x, 0.175 + 0.035, p0DeckPos.z);
    p0DeckMesh.castShadow = true;
    this.scene.add(p0DeckMesh);

    // Player 0 Extra Deck (15 cartas = ~0.15m de altura)
    const p0ExtraPos = getZonePosition(0, LOCATION.EXTRA, 0);
    const p0ExtraMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.16, CARD_HEIGHT), deckMats);
    p0ExtraMesh.position.set(p0ExtraPos.x, 0.08 + 0.035, p0ExtraPos.z);
    p0ExtraMesh.castShadow = true;
    this.scene.add(p0ExtraMesh);

    // Player 1 Main Deck
    const p1DeckPos = getZonePosition(1, LOCATION.DECK, 0);
    const p1DeckMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.35, CARD_HEIGHT), deckMats);
    p1DeckMesh.position.set(p1DeckPos.x, 0.175 + 0.035, p1DeckPos.z);
    p1DeckMesh.rotation.y = Math.PI;
    p1DeckMesh.castShadow = true;
    this.scene.add(p1DeckMesh);

    // Player 1 Extra Deck
    const p1ExtraPos = getZonePosition(1, LOCATION.EXTRA, 0);
    const p1ExtraMesh = new THREE.Mesh(new THREE.BoxGeometry(CARD_WIDTH, 0.16, CARD_HEIGHT), deckMats);
    p1ExtraMesh.position.set(p1ExtraPos.x, 0.08 + 0.035, p1ExtraPos.z);
    p1ExtraMesh.rotation.y = Math.PI;
    p1ExtraMesh.castShadow = true;
    this.scene.add(p1ExtraMesh);
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

    // Check Mate Click
    if (this.mateGroup) {
      const mateIntersects = this.raycaster.intersectObjects(this.mateGroup.children, true);
      if (mateIntersects.length > 0) {
        this.mateBounceProgress = 1.0;
        this.callbacks.onMateClick?.();
        return;
      }
    }

    // Check zones
    const zoneIntersects = this.raycaster.intersectObjects(this.zoneMeshes, false);
    if (zoneIntersects.length > 0) {
      const data = zoneIntersects[0].object.userData;
      if (data.isZone) {
        this.callbacks.onZoneClick?.(data.player, data.location, data.sequence);
      }
    }
  };

  private animate = () => {
    requestAnimationFrame(this.animate);
    const now = Date.now();

    // 1. Animate 3D Mate (Breathing, bobbing, and click-bounce)
    if (this.mateFigure) {
      if (this.mateBounceProgress > 0) {
        this.mateBounceProgress -= 0.035;
        const p = 1.0 - this.mateBounceProgress;
        const jumpY = Math.sin(p * Math.PI) * 0.45;
        this.mateFigure.position.y = 1.05 + jumpY;
        this.mateFigure.rotation.y = 0.35 + p * Math.PI * 2;
        this.mateFigure.scale.set(1.6, 1.6 * (1 + Math.sin(p * Math.PI) * 0.15), 1.6);
      } else {
        this.mateBounceProgress = 0;
        this.mateFigure.position.y = 1.05 + Math.sin(now * 0.0025) * 0.04;
        this.mateFigure.rotation.y = 0.35 + Math.sin(now * 0.0012) * 0.08;
        const breath = 1 + Math.sin(now * 0.003) * 0.02;
        this.mateFigure.scale.set(1.6, 1.6 * breath, 1.6);
      }
    }
    if (this.mateRing) {
      this.mateRing.rotation.z += 0.008;
    }

    // 2. Animate 3D Stadium Monolith Floating Crystals
    for (let i = 0; i < this.stadiumCrystals.length; i++) {
      const crystal = this.stadiumCrystals[i];
      crystal.rotation.y += 0.012;
      crystal.position.y = crystal.userData.baseY + Math.sin(now * 0.002 + i) * 0.08;
    }

    // 3. Animate Ambient Energy Particles
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

  /**
   * Spawns or updates a card on the 3D board.
   */
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

      // Start at deck position if initial spawn
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

  /**
   * Smoothly animates card from its origin location to its new location on the duel board.
   */
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
    // 1. Try to find the existing card mesh at (fromPlayer, fromLoc, fromSeq)
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
      // Spawn new card if not found (e.g. from deck/graveyard)
      const id = `card_${Date.now()}_${Math.random()}`;
      return this.addOrMoveCard(id, code, toPlayer, toLoc, toSeq, toPos);
    }

    // Update state
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

    // If moved from hand, shift sequences and re-layout hand
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

  /**
   * Arranges cards in player's hand along a natural ergonomic arc visible on screen.
   */
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
        // Human hand: grande, inclinada para a câmera no terço inferior da tela
        const z = 4.15 - Math.abs(x) * 0.08;
        const y = 1.05 + idx * 0.015;
        card.setWorldTransform({ x, y, z }, { x: -Math.PI / 3.4, y: 0, z: -x * 0.04 }, true);
      } else {
        // Opponent hand: virada para baixo no topo da tela
        const z = -3.8 + Math.abs(x) * 0.08;
        const y = 0.95 + idx * 0.015;
        card.setWorldTransform({ x, y, z }, { x: Math.PI / 4, y: Math.PI, z: x * 0.04 }, true);
      }
    });
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

  setMate(mateIcon: string) {
    if (this.mateGroup) {
      this.scene.remove(this.mateGroup);
      this.mateGroup = null;
      this.mateFigure = null;
      this.mateRing = null;
    }
    if (!mateIcon) return;

    this.mateGroup = new THREE.Group();
    this.mateGroup.position.set(-4.9, 0, 1.8);

    // 1. Multi-tier Golden & Obsidian Pedestal
    // Tier 1: Outer metallic gold bevel base
    const pedGeo = new THREE.CylinderGeometry(0.85, 0.96, 0.16, 32);
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.9,
      roughness: 0.2,
      emissive: new THREE.Color(0x3a2800),
      emissiveIntensity: 0.25,
    });
    const pedMesh = new THREE.Mesh(pedGeo, pedMat);
    pedMesh.position.y = 0.08;
    pedMesh.receiveShadow = true;
    pedMesh.castShadow = true;
    this.mateGroup.add(pedMesh);

    // Tier 2: Rotating Cyan Energy Torus Ring
    const ringGeo = new THREE.TorusGeometry(0.88, 0.025, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: new THREE.Color(0x00e5ff),
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.mateRing = new THREE.Mesh(ringGeo, ringMat);
    this.mateRing.rotation.x = Math.PI / 2;
    this.mateRing.position.y = 0.12;
    this.mateGroup.add(this.mateRing);

    // Tier 3: Inner Obsidian Dais
    const diskGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.18, 32);
    const diskMat = new THREE.MeshStandardMaterial({
      color: 0x0f1523,
      metalness: 0.7,
      roughness: 0.35,
    });
    const diskMesh = new THREE.Mesh(diskGeo, diskMat);
    diskMesh.position.y = 0.09;
    diskMesh.receiveShadow = true;
    this.mateGroup.add(diskMesh);

    // Tier 4: Gold Runic Center Ring
    const runeRingGeo = new THREE.RingGeometry(0.55, 0.62, 32);
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: new THREE.Color(0x553a00),
      emissiveIntensity: 0.3,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    const runeMesh = new THREE.Mesh(runeRingGeo, runeMat);
    runeMesh.rotation.x = -Math.PI / 2;
    runeMesh.position.y = 0.182;
    this.mateGroup.add(runeMesh);

    // 2. 3D Cutout Mate Figure with Shading & Lighting
    const textureLoader = new THREE.TextureLoader();
    const mateTexture = textureLoader.load(`/icon/${mateIcon}`);
    mateTexture.colorSpace = THREE.SRGBColorSpace;

    const figGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const figMat = new THREE.MeshStandardMaterial({
      map: mateTexture,
      transparent: true,
      alphaTest: 0.12,
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide,
    });
    this.mateFigure = new THREE.Mesh(figGeo, figMat);
    this.mateFigure.position.set(0, 1.05, 0);
    this.mateFigure.rotation.y = 0.35; // Slight isometric angle towards field
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

      // 1. Find existing card at exact controller + location + sequence
      for (const c of this.cards.values()) {
        if (c.controller === item.player && c.location === item.location && c.sequence === item.sequence) {
          card = c;
          break;
        }
      }

      // 2. If not found at slot, check if a card with this code was in hand or moving
      if (!card && item.code > 0) {
        for (const c of this.cards.values()) {
          if (c.code === item.code && !activeKeys.has(c.id)) {
            card = c;
            break;
          }
        }
      }

      // 3. If still not found, spawn new CardMesh
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

    // Clean up cards that left the field/hand
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
