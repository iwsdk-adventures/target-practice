import {
  createSystem,
  eq,
  PanelDocument,
  PanelUI,
  UIKitDocument,
} from "@iwsdk/core";
import { Signal } from "@preact/signals-core";

import type { GameState } from "./game-state.js";

type UIKitNode = ReturnType<UIKitDocument["getElementById"]>;

export class PracticeUISystem extends createSystem({
  panel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/practice.json")],
  },
}) {
  init() {
    this.queries.panel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument | undefined;
      if (!document) return;

      const playingGroup = document.getElementById("playing-group");
      const gameOverGroup = document.getElementById("game-over-group");
      const shotsText = document.getElementById("shots-text");
      const scoreText = document.getElementById("score-text");
      const finalScoreText = document.getElementById("final-score-text");
      const bestScoreText = document.getElementById("best-score-text");
      const restartButton = document.getElementById("restart-button");
      const newGameButton = document.getElementById("new-game-button");

      const gameState = this.globals.gameState as Signal<GameState>;
      const shotsRemaining = this.globals.shotsRemaining as Signal<number>;
      const currentScore = this.globals.currentScore as Signal<number>;
      const bestScore = this.globals.bestScore as Signal<number>;

      this.cleanupFuncs.push(
        gameState.subscribe((state) => {
          const isPlaying = state === "PLAYING";
          setDisplay(playingGroup, isPlaying ? "flex" : "none");
          setDisplay(gameOverGroup, isPlaying ? "none" : "flex");
        }),
        shotsRemaining.subscribe((shots) => {
          setText(shotsText, `Shots Left: ${shots}`);
        }),
        currentScore.subscribe((score) => {
          setText(scoreText, `Score: ${score}`);
          setText(finalScoreText, `Final Score: ${score}`);
        }),
        bestScore.subscribe((score) => {
          setText(bestScoreText, `Best Score: ${score}`);
        }),
      );

      const handleReset = () => {
        const reset = this.globals.resetGame as (() => void) | undefined;
        reset?.();
      };
      restartButton?.addEventListener("click", handleReset);
      newGameButton?.addEventListener("click", handleReset);
    });
  }

  update() {}
}

function setText(node: UIKitNode, text: string) {
  if (!node) return;
  (node as { setProperties: (p: { text: string }) => void }).setProperties({
    text,
  });
}

function setDisplay(node: UIKitNode, display: "flex" | "none") {
  if (!node) return;
  (
    node as { setProperties: (p: { display: "flex" | "none" }) => void }
  ).setProperties({ display });
}
