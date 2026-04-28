import {
  AudioUtils,
  createSystem,
  Entity,
  Grabbed,
  InputComponent,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Raycaster,
  SphereGeometry,
  Vector3,
} from "@iwsdk/core";
import { Signal } from "@preact/signals-core";
import { Handle as HandleRaw } from "@iwsdk/core/dist/grab/handles.js";

type HandlePointerData = { pointerWorldOrigin: Vector3 };
type HandleInstance = {
  inputState: Map<number, HandlePointerData>;
};
const Handle = HandleRaw as unknown as {
  data: { instance: Array<HandleInstance | undefined> };
};

import { HeldBy, HitMarker, Weapon } from "./components.js";
import type { EffectsApi } from "./effects.js";
import type { GameState } from "./game-state.js";

const TARGET_RADIUS = 0.248;
const MAX_TRACE_DISTANCE = 30;

const RECOIL_DURATION = 0.18;
const RECOIL_TAU = 0.05;
const RECOIL_KICK_Z = 0.06;
const RECOIL_PITCH = 0.15;
const RECOIL_INACTIVE = 999;

const markerGeometry = new SphereGeometry(0.0117, 8, 8);
const markerMaterial = new MeshBasicMaterial({ color: 0xff2020 });

function gunModelOf(entity: Entity): Object3D | undefined {
  return entity.object3D?.children[0];
}

export class WeaponSystem extends createSystem({
  weapons: { required: [Weapon] },
  grabbed: { required: [Weapon, Grabbed] },
  held: { required: [Weapon, HeldBy] },
}) {
  private _raycaster!: Raycaster;
  private _muzzleOrigin!: Vector3;
  private _muzzleDir!: Vector3;
  private _targetLocal!: Vector3;
  private _gripPos!: Vector3;
  private _weaponWorldPos!: Vector3;
  private _traceEnd!: Vector3;

  init() {
    this._raycaster = new Raycaster();
    this._muzzleOrigin = new Vector3();
    this._muzzleDir = new Vector3();
    this._targetLocal = new Vector3();
    this._gripPos = new Vector3();
    this._weaponWorldPos = new Vector3();
    this._traceEnd = new Vector3();

    this.queries.grabbed.subscribe("qualify", (entity) => {
      const handedness = this.identifyHolderHand(entity);
      if (!entity.hasComponent(HeldBy)) {
        entity.addComponent(HeldBy, { handedness });
      } else {
        entity.setValue(HeldBy, "handedness", handedness);
      }
    });

    this.queries.grabbed.subscribe("disqualify", (entity) => {
      if (entity.hasComponent(HeldBy)) {
        entity.removeComponent(HeldBy);
      }
      const restPos = entity.getVectorView(
        Weapon,
        "restPosition",
      ) as Float32Array;
      const restQuat = entity.getVectorView(
        Weapon,
        "restRotation",
      ) as Float32Array;
      const obj = entity.object3D;
      if (obj) {
        obj.position.set(restPos[0], restPos[1], restPos[2]);
        obj.quaternion.set(restQuat[0], restQuat[1], restQuat[2], restQuat[3]);
      }
      const model = gunModelOf(entity);
      if (model) {
        model.position.set(0, 0, 0);
        model.quaternion.set(0, 0, 0, 1);
      }
      entity.setValue(Weapon, "recoilElapsed", RECOIL_INACTIVE);
    });
  }

  update(delta: number, time: number) {
    this.tickRecoil(delta);

    const gameState = this.globals.gameState as Signal<GameState>;
    const shotsRemaining = this.globals.shotsRemaining as Signal<number>;
    if (gameState.peek() !== "PLAYING" || shotsRemaining.peek() <= 0) return;

    const nowMs = time * 1000;

    for (const weapon of this.queries.held.entities) {
      const handedness = weapon.getValue(HeldBy, "handedness") as
        | "left"
        | "right"
        | null;
      if (!handedness) continue;
      const gamepad = this.input.gamepads[handedness];
      if (!gamepad) continue;

      const weaponType = weapon.getValue(Weapon, "weaponType");
      let shouldFire = false;
      if (weaponType === "smg") {
        const interval = weapon.getValue(Weapon, "fireIntervalMs") ?? 200;
        const next = weapon.getValue(Weapon, "nextFireTime") ?? 0;
        if (
          gamepad.getButtonPressed(InputComponent.Trigger) &&
          nowMs >= next
        ) {
          shouldFire = true;
          weapon.setValue(Weapon, "nextFireTime", nowMs + interval);
        }
      } else {
        if (gamepad.getButtonDown(InputComponent.Trigger)) {
          shouldFire = true;
        }
      }

      if (shouldFire) {
        this.fireShot(weapon);
        if (shotsRemaining.peek() <= 0) return;
      }
    }
  }

  private tickRecoil(delta: number) {
    for (const weapon of this.queries.weapons.entities) {
      const elapsed = weapon.getValue(Weapon, "recoilElapsed") ?? RECOIL_INACTIVE;
      if (elapsed >= RECOIL_DURATION) continue;
      const next = elapsed + delta;
      const model = gunModelOf(weapon);
      if (!model) continue;
      if (next >= RECOIL_DURATION) {
        model.position.set(0, 0, 0);
        model.quaternion.set(0, 0, 0, 1);
        weapon.setValue(Weapon, "recoilElapsed", RECOIL_INACTIVE);
        continue;
      }
      const decay = Math.exp(-next / RECOIL_TAU);
      model.position.set(0, 0, RECOIL_KICK_Z * decay);
      model.rotation.set(RECOIL_PITCH * decay, 0, 0);
      weapon.setValue(Weapon, "recoilElapsed", next);
    }
  }

  private fireShot(weapon: Entity) {
    const model = gunModelOf(weapon);
    if (!model) return;
    const shotsRemaining = this.globals.shotsRemaining as Signal<number>;
    const currentScore = this.globals.currentScore as Signal<number>;
    const targetEntity = this.globals.targetEntity as Entity | undefined;
    const effects = this.globals.effects as EffectsApi | undefined;

    model.getWorldDirection(this._muzzleDir);
    this._muzzleDir.negate();
    this._muzzleOrigin.set(0, 0, -0.1);
    model.localToWorld(this._muzzleOrigin);

    AudioUtils.play(weapon);
    weapon.setValue(Weapon, "recoilElapsed", 0);

    let hitWorld: Vector3 | null = null;

    if (targetEntity?.object3D) {
      this._raycaster.ray.origin.copy(this._muzzleOrigin);
      this._raycaster.ray.direction.copy(this._muzzleDir);
      this._raycaster.far = MAX_TRACE_DISTANCE;
      const hits = this._raycaster.intersectObject(targetEntity.object3D, true);
      if (hits.length > 0) {
        hitWorld = hits[0].point;
        this._targetLocal.copy(hits[0].point);
        targetEntity.object3D.worldToLocal(this._targetLocal);
        const r = Math.hypot(this._targetLocal.x, this._targetLocal.y);
        if (r <= TARGET_RADIUS) {
          const score = Math.max(0, Math.round(100 * (1 - r / TARGET_RADIUS)));
          currentScore.value = currentScore.peek() + score;
          const markerMesh = new Mesh(markerGeometry, markerMaterial);
          markerMesh.position.set(
            this._targetLocal.x,
            this._targetLocal.y,
            0.075,
          );
          const markerEntity = this.world.createTransformEntity(
            markerMesh,
            targetEntity,
          );
          markerEntity.addComponent(HitMarker);
        }
      }
    }

    if (effects) {
      effects.playMuzzleFlash(this._muzzleOrigin, this._muzzleDir);
      if (hitWorld) {
        this._traceEnd.copy(hitWorld);
      } else {
        this._traceEnd
          .copy(this._muzzleOrigin)
          .addScaledVector(this._muzzleDir, MAX_TRACE_DISTANCE);
      }
      effects.playBulletTrace(this._muzzleOrigin, this._traceEnd);
    }

    shotsRemaining.value = shotsRemaining.peek() - 1;
  }

  private identifyHolderHand(entity: Entity): "left" | "right" {
    const handle = Handle.data.instance[entity.index];
    if (handle && handle.inputState && handle.inputState.size > 0) {
      const first = handle.inputState.values().next().value;
      if (first?.pointerWorldOrigin) {
        const origin = first.pointerWorldOrigin as Vector3;
        const left = this.distanceToGrip(origin, "left");
        const right = this.distanceToGrip(origin, "right");
        return left <= right ? "left" : "right";
      }
    }
    const obj = entity.object3D;
    if (obj) {
      obj.getWorldPosition(this._weaponWorldPos);
      const left = this.distanceToGrip(this._weaponWorldPos, "left");
      const right = this.distanceToGrip(this._weaponWorldPos, "right");
      return left <= right ? "left" : "right";
    }
    return "right";
  }

  private distanceToGrip(point: Vector3, handedness: "left" | "right"): number {
    const grip = this.player.gripSpaces[handedness];
    if (!grip) return Infinity;
    grip.getWorldPosition(this._gripPos);
    return point.distanceTo(this._gripPos);
  }
}
