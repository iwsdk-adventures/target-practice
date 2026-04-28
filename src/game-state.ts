import { createSystem, Quaternion, Vector3 } from "@iwsdk/core";
import { Signal } from "@preact/signals-core";
import { Handle as HandleRaw } from "@iwsdk/core/dist/grab/handles.js";

type HandleInstance = { cancel: () => void };
const Handle = HandleRaw as unknown as {
  data: { instance: Array<HandleInstance | undefined> };
};

import { HitMarker, Weapon } from "./components.js";

export const BEST_SCORE_KEY = "targetPractice.bestScore";

export type GameState = "PLAYING" | "GAME_OVER";

export class GameStateSystem extends createSystem({
  markers: { required: [HitMarker] },
  weapons: { required: [Weapon] },
}) {
  private _restPos!: Vector3;
  private _restQuat!: Quaternion;

  init() {
    this._restPos = new Vector3();
    this._restQuat = new Quaternion();

    const shotsRemaining = this.globals.shotsRemaining as Signal<number>;
    const currentScore = this.globals.currentScore as Signal<number>;
    const bestScore = this.globals.bestScore as Signal<number>;
    const gameState = this.globals.gameState as Signal<GameState>;

    this.cleanupFuncs.push(
      shotsRemaining.subscribe((shots) => {
        if (shots <= 0 && gameState.peek() === "PLAYING") {
          const score = currentScore.peek();
          if (score > bestScore.peek()) {
            bestScore.value = score;
            try {
              localStorage.setItem(BEST_SCORE_KEY, String(score));
            } catch {
              // localStorage may be unavailable (SSR, private browsing); ignore
            }
          }
          gameState.value = "GAME_OVER";
        }
      }),
    );

    this.globals.resetGame = () => this.resetGame();
  }

  update() {}

  private resetGame() {
    const shotsRemaining = this.globals.shotsRemaining as Signal<number>;
    const currentScore = this.globals.currentScore as Signal<number>;
    const gameState = this.globals.gameState as Signal<GameState>;

    for (const marker of [...this.queries.markers.entities]) {
      marker.destroy();
    }

    for (const weapon of this.queries.weapons.entities) {
      const handle = Handle.data.instance[weapon.index];
      if (handle) {
        try {
          handle.cancel();
        } catch {
          // ignore
        }
      }
      const restPosArr = weapon.getVectorView(
        Weapon,
        "restPosition",
      ) as Float32Array;
      const restQuatArr = weapon.getVectorView(
        Weapon,
        "restRotation",
      ) as Float32Array;
      this._restPos.set(restPosArr[0], restPosArr[1], restPosArr[2]);
      this._restQuat.set(
        restQuatArr[0],
        restQuatArr[1],
        restQuatArr[2],
        restQuatArr[3],
      );
      const obj = weapon.object3D;
      if (obj) {
        obj.position.copy(this._restPos);
        obj.quaternion.copy(this._restQuat);
        const model = obj.children[0];
        if (model) {
          model.position.set(0, 0, 0);
          model.quaternion.set(0, 0, 0, 1);
        }
      }
      weapon.setValue(Weapon, "recoilElapsed", 999);
    }

    currentScore.value = 0;
    shotsRemaining.value = 20;
    gameState.value = "PLAYING";
  }
}
