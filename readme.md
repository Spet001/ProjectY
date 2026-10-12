# MDPro Web — 3D WebGL Yu-Gi-Oh! Master Duel Simulator

> [!IMPORTANT]
> **INTELLECTUAL PROPERTY & FAN PROJECT DISCLAIMER**
>
> **MDPro Web** is a non-commercial, open-source **fan project / fangame** created strictly for educational, research, and entertainment purposes.
>
> ***Yu-Gi-Oh!***, ***Yu-Gi-Oh! Official Card Game (OCG)***, ***Yu-Gi-Oh! Trading Card Game (TCG)***, and ***Yu-Gi-Oh! Master Duel***—including all card names, card text, game rules, card artwork, 2D/3D visual assets, UI textures, icons, sound effects (SFX), and background music (BGM)—are the exclusive copyrighted property and registered trademarks of **Konami Digital Entertainment Co., Ltd. (KONAMI)**, **Studio Dice / Shueisha**, **TV Tokyo**, and their respective licensors.
>
> This project is **not** affiliated with, endorsed by, sponsored by, or approved by **Konami Digital Entertainment**. No copyright or trademark infringement is intended. Please support the official release by playing ***Yu-Gi-Oh! Master Duel*** on Steam, PlayStation, Xbox, Nintendo Switch, iOS, and Android.

---

## Overview

**MDPro Web** is a browser-based, Master Rule 5 (2020 Revision) compliant *Yu-Gi-Oh!* simulator built with **TypeScript**, **Three.js (WebGL)**, **SQL.js (SQLite in WebAssembly)**, and **`koishipro-core.js` (`libocgcore` compiled to WebAssembly)**. It brings the visual presentation, HUD workflow, and audio atmosphere of *Yu-Gi-Oh! Master Duel* and *MDPro3* directly to the web browser with zero native dependencies.

---

## Key Features

### 1. 100% Authentic OCGCore Rules Engine (`libocgcore` WebAssembly)
- **Full Master Rule 5 Support**: Runs the genuine C++/Lua `libocgcore` duel processor compiled to WebAssembly via `koishipro-core.js`, paired with `script.zip` card scripts and `cards.cdb`.
- **Complete Summoning Mechanics**: Normal Summon, Tribute Summon, Flip Summon, Ritual Summon, Fusion Summon, Synchro Summon, Xyz Summon (with 3D stacked Xyz Overlay Units), Pendulum Summon, and Link Summon (including Extra Monster Zones `[5]` & `[6]`).
- **Cryptographic Deck Shuffling**: Every duel performs a Fisher-Yates shuffle backed by `crypto.getRandomValues()` and initializes the OCGCore PRNG (`createDuelV2`) with fresh 32-bit entropy so starting hands and draws are randomized every match.
- **Strict Hidden Knowledge Enforcement**: Opponent's hand cards, face-down Set monsters/spells/traps, face-down Extra Deck cards, and face-down Banished cards are masked both in 3D WebGL textures and in the 2D Card Inspector (`??? (Hidden Card)`), preventing any hidden information leaks.
- **Heuristic AI Opponent**: Built-in AI bot (`selectBestResponse`) capable of piloting any `.ydk` Structure Deck or custom deck across Main Phase, Battle Phase, Chain windows, and multi-material selections (`SelectUnselectCard`, `SelectCard`, `SelectOption`, `SelectPosition`, `SelectPlace`).

### 2. Interactive 3D WebGL Duel Field (`Three.js`)
- **Master Duel Board Geometry**:
  - 5 Main Monster Zones (`MZONE [0..4]`) and 5 Spell & Trap Zones (`SZONE [0..4]`) per player.
  - Field Spell Zones (`SZONE [5]`) and Pendulum Scale Zones.
  - Properly spaced Extra Monster Zones (`EMZ [5]` and `EMZ [6]`) in the center of the field.
  - 3D stacked Main Deck, Extra Deck (with golden Special Summon aura), Graveyard (GY), and Banished pedestals with live card-count badges.
- **High-Resolution Framed Cards**:
  - Dynamic 2D Canvas & DOM compositing for all 15 card frames (Normal, Effect, Ritual, Fusion, Synchro, Xyz, Link, Normal/Effect/Ritual/Fusion/Synchro/Xyz Pendulum, Spell, Trap, Token).
  - Accurate Attribute orbs, Level stars, Rank stars, Link rating arrows, Pendulum scales, and ATK/DEF typography.
- **Visual Zone-to-Zone Card Transfer Flights & Feed**:
  - Smooth 3D parabolic arc animations with color-coded glowing trails whenever cards move between Deck, Hand, Field, Graveyard (GY), Banished, or Extra Deck, paired with a real-time **Card Move Feed** on the right HUD and zone-specific sound effects.
- **3D Duel Mates (Pets) & Custom `.glb` Support**:
  - Supports built-in Mate icons and custom `.glb` / `.gltf` 3D animated models uploaded by the user.

### 3. Master Duel HUD & Prompt Submenus
- **Left Card Inspector**:
  - Displays the full framed card, Attribute, Level/Rank/Link badge, Type line, ATK/DEF, and scrollable card text.
  - Automatically highlights the **exact effect clause being activated** in glowing cyan during Chain building, optional trigger prompts, and multi-effect selections.
- **Animated Life Points (LP) HUD & End-of-Duel Screen**:
  - Real-time rolling LP counters (`8000 ➔ 0`), dynamic health bar color transitions, HUD damage shake, and floating `-Damage` / `+Recover` popups for battle damage, effect damage, recovery, and LP cost payments (`MSG_DAMAGE`, `MSG_RECOVER`, `MSG_PAY_LPCOST`, `MSG_LPUPDATE`).
  - Full **VICTORY / DEFEAT / DRAW** overlay when a duel concludes (`MSG_WIN`), featuring **Rematch** and **Return to Main Menu** actions.
- **Specialized Master Duel Modals & Drawers**:
  - **Circular Card Action Popover**: Hover/click any playable card to summon, set, reposition, declare an attack, or activate an effect.
  - **Multi-Effect Tabbed Modal (`1`, `2`, ...)**: Clean numbered tabs displaying the exact `[1]` / `[2]` clause from `strings.conf` or the card text when a card has multiple effects.
  - **Chain Formation & Resolution Overlay**: Displays `⚡ CHAIN START — LINK 1`, `⚡ CHAIN BUILDING`, `✨ RESOLVING CHAIN LINK N`, and `✓ CHAIN RESOLVED` with numbered chain link badges and SFX.
  - **Extra Deck Preview & Special Summon Drawer**: Right-side sliding drawer and bottom-center summon selector when Extra Deck monsters are summonable.
  - **Battle Position Selector & Interactive 3D Zone Selector**: Visual Attack/Defense position picker and glowing 3D field tile selector.

### 4. Full Deck Editor & Browser Persistence
- **My Deck Selection Screen**:
  - Create a new deck from scratch (`+`), browse and clone from **40+ built-in Structure / AI Decks** (`AI_*.ydk`), or use **Public Search** to open YGOPRODeck and import `.ydk` files directly.
  - All custom decks and assigned deck boxes (binders) are persisted in browser `localStorage`.
- **3-Column Master Duel Deck Editor**:
  - **Left Column**: Full Card Inspector preview on hover.
  - **Center Column**: Main Deck (40–60 cards) and Extra Deck (0–15 cards) grids with framed cards and right-click / click add-remove controls.
  - **Right Column**: Instant text search and multi-filter panel (Card Category, Attribute, Monster Type, Level/Rank, Sort by ATK/DEF/Level/Name).

### 5. Profile, Customization & Dynamic Audio
- **Two-Layer Main Menu Visuals**:
  - **Main Menu Theme 1 (Front Cutout)**: Sharp, unstretched character/monster cutout positioned on the right.
  - **Main Menu Theme 2 (Back Background)**: Full-screen atmospheric background scene behind the cutout.
- **Custom Asset Uploads (`IndexedDB`)**:
  - Upload and persist custom **FieldMats** (`.png`/`.jpg`/`.webp`), **Card Sleeves / Protectors** (`.png`/`.jpg`), **3D Duel Mates** (`.glb`/`.gltf`), and **Profile Avatars** directly in your browser via `IndexedDB`.
- **Unified Dynamic BGM & SFX System**:
  - Automatic `BGM_MENU_02.ogg` playback inside the Deck Editor.
  - Unified Duel BGM groups (`DUEL_01` through `DUEL_16`) that combine Normal, Keycard, and Climax tracks, cycling randomly across tracks and dynamically shifting when LP drops into climax range.

---

## Project Architecture

```text
brave-oppenheimer/
├── index.html                  # Main application shell & Master Duel HUD overlays
├── vite.config.ts              # Vite dev server + /api/assets & /api/decks middleware
├── public/                     # Static game assets (served at root /)
│   ├── wasm/                   # libocgcore.wasm & sql-wasm.wasm binaries
│   ├── data/                   # script.zip, locales/en-US/cards.cdb & strings.conf, decks/*.ydk
│   ├── pics/                   # Card artwork images (<code_id>.jpg)
│   ├── texture/                # Card frames, attributes, field mats, sleeves, UI icons
│   ├── sound/                  # Sound Effects (SE_DUEL / SE_SYS) & BGM (.ogg)
│   └── deckcase/               # Deck box / binder illustrations
└── src/
    ├── main.ts                 # Application bootstrap, HUD orchestration & prompt handlers
    ├── style.css               # Master Duel & MDPro3 UI styling, animations & layouts
    ├── audio/
    │   └── audio-manager.ts    # Web Audio / HTML5 Audio manager for BGM & Duel SFX
    ├── engine/
    │   ├── card-database.ts    # SQLite card reader, FTS/filter search & strings.conf parser
    │   ├── constants.ts        # OCGCore location, position, phase, type & race bitmasks
    │   ├── duel-runner.ts      # WebAssembly OCGCore loop, deck shuffler, AI & event emitter
    │   └── ydk.ts              # .ydk deck parser & serializer
    ├── render/
    │   ├── card-mesh.ts        # 3D CardMesh with dynamic canvas textures & hidden-face mask
    │   └── three-board.ts      # Three.js 3D Duel Field, zones, camera, lighting & flights
    └── ui/
        ├── card-ui.ts          # 2D framed card generator, effect extractor & inspector HTML
        ├── custom-assets.ts    # IndexedDB persistence for user-uploaded images & .glb mates
        ├── deck-editor.ts      # Deck Selection screen, Structure Deck cloner & 3-column editor
        ├── deck-store.ts       # LocalStorage persistence for custom decks & deck cases
        └── main-menu.ts        # MDPro3 Main Menu, VS AI launcher, Profile & Options modals
```

---

## Getting Started

### Prerequisites
- **Node.js** `>= 18.0.0`
- **npm** `>= 9.0.0`

### Installation & Development Server

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open the local URL displayed in your terminal (typically `http://localhost:5173`) in any modern WebGL-capable browser (Chrome, Edge, Firefox, Safari).

3. **Typecheck & Production Build**:
   ```bash
   npm run typecheck
   npm run build
   ```

---

## Controls & How to Play

| Action | Control |
| :--- | :--- |
| **Inspect Card** | Hover over any face-up card on the field, in your hand, or in any drawer to view its full details and highlighted active effect on the left panel. |
| **Play / Summon / Activate Card** | Click a glowing card in your hand or on your field to open the circular action menu (**Normal Summon**, **Special Summon**, **Activate Effect**, **Set**, **Change Position**, **Attack**). |
| **Extra Deck Summon** | When your Extra Deck glows gold, hover or click your Extra Deck pedestal (bottom-left of the 3D board) or click the floating **Special Summon** button. |
| **View Graveyard / Banished** | Click either player's Graveyard (GY) or Banished pedestal on the 3D board to open the right-side zone inspection drawer. |
| **Advance Duel Phase** | Click the glowing **Phase Orb** on the right side of the field to open `Battle Phase`, `Main Phase 2`, or `End Turn` shortcuts. |
| **Minimize Selection Drawer** | Click the **Minimize (`_`)** button on the bottom-center selection drawer to inspect the 3D field unobstructed while targeting cards. |
| **Auto-Play (AI Pilot)** | Click the **Robot (`🤖`)** button in the bottom-right HUD to let the heuristic AI play your turns automatically. |

---

## Credits & Acknowledgments

- **Konami Digital Entertainment**: Creator and copyright holder of *Yu-Gi-Oh!*, *Yu-Gi-Oh! OCG/TCG*, and *Yu-Gi-Oh! Master Duel*.
- **Fluorohydride & the YGOPro / EdoPro / KoishiPro Community**: For developing and maintaining `ocgcore` (`libocgcore`), `koishipro-core.js`, `ygopro-msg-encode`, and the Lua card script ecosystem.
- **MDPro3 Project**: For UI/UX inspiration and asset structure conventions.
