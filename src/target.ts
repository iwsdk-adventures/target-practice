import { createSystem, Entity, MathUtils } from "@iwsdk/core";
import { Signal } from "@preact/signals-core";

import { Target } from "./components.js";
import type { GameState } from "./game-state.js";

const ACTIVE_Z = -10;
const REVIEW_Z = -2;
const ANIM_DURATION = 1.0;

export class TargetSystem extends createSystem({
  target: { required: [Target] },
}) {
  private _animElapsed = 0;
  private _from = ACTIVE_Z;
  private _to = ACTIVE_Z;
  private _animating = false;

  init() {
    const gameState = this.globals.gameState as Signal<GameState>;
    this.cleanupFuncs.push(
      gameState.subscribe((state) => {
        const targetEntity = this.globals.targetEntity as Entity | undefined;
        if (!targetEntity?.object3D) return;
        this._from = targetEntity.object3D.position.z;
        this._to = state === "GAME_OVER" ? REVIEW_Z : ACTIVE_Z;
        this._animElapsed = 0;
        this._animating = this._from !== this._to;
      }),
    );
  }

  update(delta: number) {
    if (!this._animating) return;
    const targetEntity = this.globals.targetEntity as Entity | undefined;
    if (!targetEntity?.object3D) return;

    this._animElapsed += delta;
    const t = MathUtils.clamp(this._animElapsed / ANIM_DURATION, 0, 1);
    const eased = t * t * (3 - 2 * t);
    targetEntity.object3D.position.z = MathUtils.lerp(
      this._from,
      this._to,
      eased,
    );

    if (t >= 1) {
      this._animating = false;
    }
  }
}
