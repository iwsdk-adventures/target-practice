import {
  AssetType,
  AssetManifest,
  SessionMode,
  World,
} from "@iwsdk/core";
import { signal } from "@preact/signals-core";

import { HeldBy, HitMarker, Target, Weapon } from "./components.js";
import { EffectsSystem } from "./effects.js";
import { BEST_SCORE_KEY, GameStateSystem } from "./game-state.js";
import { PracticeUISystem } from "./practice-ui.js";
import { buildScene } from "./scene.js";
import { TargetSystem } from "./target.js";
import { WeaponSystem } from "./weapon.js";

const assets: AssetManifest = {
  gunshot: {
    url: "/audio/shot.mp3",
    type: AssetType.Audio,
    priority: "background",
  },
  blasterB: {
    url: "/gltf/blaster/blaster-b.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  blasterC: {
    url: "/gltf/blaster/blaster-c.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  floorThick: {
    url: "/gltf/prototype/floor-thick.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  wall: {
    url: "/gltf/prototype/wall.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  wallWindow: {
    url: "/gltf/prototype/wall-window-small.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  wallCorner: {
    url: "/gltf/prototype/wall-corner.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  targetBoard: {
    url: "/gltf/prototype/target-b-round.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  crate: {
    url: "/gltf/prototype/crate.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
};

function loadBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  assets,
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: false,
    grabbing: true,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
  },
}).then((world) => {
  world.globals.gameState = signal<"PLAYING" | "GAME_OVER">("PLAYING");
  world.globals.shotsRemaining = signal(20);
  world.globals.currentScore = signal(0);
  world.globals.bestScore = signal(loadBestScore());

  world
    .registerComponent(Weapon)
    .registerComponent(HeldBy)
    .registerComponent(Target)
    .registerComponent(HitMarker);

  buildScene(world);

  world
    .registerSystem(GameStateSystem, { priority: 0 })
    .registerSystem(WeaponSystem, { priority: 5 })
    .registerSystem(TargetSystem, { priority: 20 })
    .registerSystem(EffectsSystem, { priority: 25 })
    .registerSystem(PracticeUISystem, { priority: 35 });
});
