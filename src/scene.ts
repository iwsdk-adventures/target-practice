import {
  AssetManager,
  AudioSource,
  Box3,
  Group,
  Interactable,
  Object3D,
  OneHandGrabbable,
  PanelUI,
  PlaybackMode,
  Vector3,
  World,
} from "@iwsdk/core";

import { Target, Weapon } from "./components.js";

const TILE = 3;
const FLOOR_TILE_COUNT = 4;
const CORRIDOR_HALF_WIDTH = 1.5;

const FLOOR_FRONT_Z = +TILE / 2;
const FLOOR_BACK_Z = FLOOR_FRONT_Z - FLOOR_TILE_COUNT * TILE;
const FRONT_WALL_Z = FLOOR_FRONT_Z + 0.1;
const BACK_WALL_Z = FLOOR_BACK_Z - 0.1;
const SIDE_WALL_CENTER_X = CORRIDOR_HALF_WIDTH + 0.1;

const COUNTER_CENTER_Z = -0.8;
const COUNTER_TOP_Y = 1.0;

const handgunRest: [number, number, number] = [
  -0.45,
  COUNTER_TOP_Y + 0.25,
  COUNTER_CENTER_Z,
];
const smgRest: [number, number, number] = [
  0.45,
  COUNTER_TOP_Y + 0.25,
  COUNTER_CENTER_Z,
];

export function buildScene(world: World): void {
  buildFloor(world);
  buildSideWalls(world);
  buildEndWalls(world);
  buildCounter(world);

  const targetEntity = buildTarget(world);
  world.globals.targetEntity = targetEntity;

  const handgun = buildHandgun(world);
  const smg = buildSMG(world);
  world.globals.weaponEntities = [handgun, smg];

  buildPanel(world);
}

function cloneAsset(name: string): Object3D {
  const gltf = AssetManager.getGLTF(name);
  if (!gltf) {
    throw new Error(`Asset ${name} not loaded`);
  }
  return gltf.scene.clone(true);
}

function buildFloor(world: World) {
  for (let i = 0; i < FLOOR_TILE_COUNT; i++) {
    const tile = cloneAsset("floorThick");
    tile.scale.set(TILE, 1, TILE);
    tile.position.set(0, -0.2, FLOOR_FRONT_Z - TILE / 2 - i * TILE);
    world.createTransformEntity(tile);
  }
}

function buildSideWalls(world: World) {
  for (let i = 0; i < FLOOR_TILE_COUNT; i++) {
    const z = FLOOR_FRONT_Z - TILE / 2 - i * TILE;
    const useWindow = i === 1 || i === 2;
    for (const side of [-1, 1] as const) {
      const wall = cloneAsset(useWindow ? "wallWindow" : "wall");
      wall.scale.set(1, TILE, TILE);
      wall.position.set(side * SIDE_WALL_CENTER_X, 0, z);
      world.createTransformEntity(wall);
    }
  }
}

function buildEndWalls(world: World) {
  const front = cloneAsset("wall");
  front.scale.set(1, TILE, TILE);
  front.rotation.y = Math.PI / 2;
  front.position.set(0, 0, FRONT_WALL_Z);
  world.createTransformEntity(front);

  const back = cloneAsset("wall");
  back.scale.set(1, TILE, TILE);
  back.rotation.y = Math.PI / 2;
  back.position.set(0, 0, BACK_WALL_Z);
  world.createTransformEntity(back);
}

function buildCounter(world: World) {
  for (const x of [-1, 0, 1]) {
    const crate = cloneAsset("crate");
    crate.scale.setScalar(2);
    crate.position.set(x, 0, COUNTER_CENTER_Z);
    world.createTransformEntity(crate);
  }
}

function buildTarget(world: World) {
  const board = cloneAsset("targetBoard");
  const root = new Group();

  const box = new Box3().setFromObject(board);
  const center = new Vector3();
  box.getCenter(center);
  board.position.sub(center);

  const inner = new Group();
  inner.add(board);
  inner.rotation.y = Math.PI / 2;
  root.add(inner);

  root.scale.setScalar(3);
  root.position.set(0, 1.5, -10);

  const targetEntity = world.createTransformEntity(root);
  targetEntity.addComponent(Target);
  return targetEntity;
}

function buildHandgun(world: World) {
  const wrapper = new Group();
  const model = cloneAsset("blasterB");
  wrapper.add(model);
  wrapper.position.set(...handgunRest);

  const entity = world.createTransformEntity(wrapper);
  entity
    .addComponent(OneHandGrabbable, {})
    .addComponent(Interactable)
    .addComponent(Weapon, {
      weaponType: "handgun",
      fireIntervalMs: 0,
      restPosition: handgunRest,
      restRotation: [0, 0, 0, 1],
    })
    .addComponent(AudioSource, {
      src: "/audio/shot.mp3",
      positional: true,
      maxInstances: 4,
      playbackMode: PlaybackMode.Overlap,
      volume: 0.4,
    });
  return entity;
}

function buildSMG(world: World) {
  const wrapper = new Group();
  const model = cloneAsset("blasterC");
  wrapper.add(model);
  wrapper.position.set(...smgRest);

  const entity = world.createTransformEntity(wrapper);
  entity
    .addComponent(OneHandGrabbable, {})
    .addComponent(Interactable)
    .addComponent(Weapon, {
      weaponType: "smg",
      fireIntervalMs: 200,
      restPosition: smgRest,
      restRotation: [0, 0, 0, 1],
    })
    .addComponent(AudioSource, {
      src: "/audio/shot.mp3",
      positional: true,
      maxInstances: 6,
      playbackMode: PlaybackMode.Overlap,
      volume: 0.35,
    });
  return entity;
}

function buildPanel(world: World) {
  const entity = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/practice.json",
      maxWidth: 0.7,
      maxHeight: 0.32,
    })
    .addComponent(Interactable);
  const panel = entity.object3D!;
  panel.position.set(0, 1.25, -1.1);
  panel.rotation.x = -Math.PI / 9;
  return entity;
}
