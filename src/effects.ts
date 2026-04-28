import {
  CylinderGeometry,
  createSystem,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Vector3,
} from "@iwsdk/core";

const POOL_SIZE = 16;

const RING_LIFETIME = 0.2;
const RING_START_SCALE = 0.6;
const RING_END_SCALE = 3.0;
const RING_START_OPACITY = 1.0;

const TRACE_LIFETIME = 0.08;
const TRACE_START_OPACITY = 1.0;

interface RingSlot {
  mesh: Mesh;
  material: MeshBasicMaterial;
  active: boolean;
  elapsed: number;
}

interface TraceSlot {
  mesh: Mesh;
  material: MeshBasicMaterial;
  active: boolean;
  elapsed: number;
}

export interface EffectsApi {
  playMuzzleFlash(originWorld: Vector3, dirWorld: Vector3): void;
  playBulletTrace(originWorld: Vector3, endWorld: Vector3): void;
}

export class EffectsSystem extends createSystem({}) {
  private rings: RingSlot[] = [];
  private traces: TraceSlot[] = [];
  private _yAxis!: Vector3;
  private _scratchVec!: Vector3;
  private _scratchQuat!: Quaternion;

  init() {
    this._yAxis = new Vector3(0, 1, 0);
    this._scratchVec = new Vector3();
    this._scratchQuat = new Quaternion();

    const root = new Group();
    root.name = "effects-root";
    this.world.createTransformEntity(root);

    const ringGeometry = new RingGeometry(0.025, 0.06, 24);
    const ringTemplate = new MeshBasicMaterial({
      color: 0xffd070,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const material = ringTemplate.clone();
      const mesh = new Mesh(ringGeometry, material);
      mesh.visible = false;
      root.add(mesh);
      this.rings.push({ mesh, material, active: false, elapsed: 0 });
    }

    const traceGeometry = new CylinderGeometry(0.008, 0.008, 1, 8);
    const traceTemplate = new MeshBasicMaterial({
      color: 0xfff0b0,
      transparent: true,
      depthWrite: false,
    });

    for (let i = 0; i < POOL_SIZE; i++) {
      const material = traceTemplate.clone();
      const mesh = new Mesh(traceGeometry, material);
      mesh.visible = false;
      root.add(mesh);
      this.traces.push({ mesh, material, active: false, elapsed: 0 });
    }

    const api: EffectsApi = {
      playMuzzleFlash: (originWorld, dirWorld) =>
        this.spawnRing(originWorld, dirWorld),
      playBulletTrace: (originWorld, endWorld) =>
        this.spawnTrace(originWorld, endWorld),
    };
    this.globals.effects = api;
  }

  update(delta: number) {
    for (const slot of this.rings) {
      if (!slot.active) continue;
      slot.elapsed += delta;
      const t = slot.elapsed / RING_LIFETIME;
      if (t >= 1) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      const scale =
        RING_START_SCALE + (RING_END_SCALE - RING_START_SCALE) * t;
      slot.mesh.scale.set(scale, scale, scale);
      slot.material.opacity = RING_START_OPACITY * (1 - t);
    }

    for (const slot of this.traces) {
      if (!slot.active) continue;
      slot.elapsed += delta;
      const t = slot.elapsed / TRACE_LIFETIME;
      if (t >= 1) {
        slot.active = false;
        slot.mesh.visible = false;
        continue;
      }
      slot.material.opacity = TRACE_START_OPACITY * (1 - t);
    }
  }

  private spawnRing(originWorld: Vector3, dirWorld: Vector3) {
    const slot = this.rings.find((s) => !s.active);
    if (!slot) return;

    slot.active = true;
    slot.elapsed = 0;
    slot.mesh.visible = true;
    slot.mesh.scale.set(RING_START_SCALE, RING_START_SCALE, RING_START_SCALE);
    slot.material.opacity = RING_START_OPACITY;

    this._scratchVec.copy(originWorld).addScaledVector(dirWorld, 0.02);
    slot.mesh.position.copy(this._scratchVec);
    this._scratchVec.copy(originWorld).addScaledVector(dirWorld, 1);
    slot.mesh.lookAt(this._scratchVec);
  }

  private spawnTrace(originWorld: Vector3, endWorld: Vector3) {
    const slot = this.traces.find((s) => !s.active);
    if (!slot) return;

    this._scratchVec.copy(endWorld).sub(originWorld);
    const length = this._scratchVec.length();
    if (length < 0.001) return;
    this._scratchVec.divideScalar(length);

    slot.active = true;
    slot.elapsed = 0;
    slot.mesh.visible = true;
    slot.material.opacity = TRACE_START_OPACITY;

    slot.mesh.position
      .copy(originWorld)
      .addScaledVector(this._scratchVec, length / 2);
    this._scratchQuat.setFromUnitVectors(this._yAxis, this._scratchVec);
    slot.mesh.quaternion.copy(this._scratchQuat);
    slot.mesh.scale.set(1, length, 1);
  }
}
