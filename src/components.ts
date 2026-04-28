import { createComponent, Types } from "@iwsdk/core";

export const Weapon = createComponent("Weapon", {
  weaponType: {
    type: Types.Enum,
    enum: { Handgun: "handgun", SMG: "smg" },
    default: "handgun",
  },
  fireIntervalMs: { type: Types.Float32, default: 0 },
  nextFireTime: { type: Types.Float32, default: 0 },
  restPosition: { type: Types.Vec3, default: [0, 0, 0] },
  restRotation: { type: Types.Vec4, default: [0, 0, 0, 1] },
  recoilElapsed: { type: Types.Float32, default: 999 },
});

export const HeldBy = createComponent("HeldBy", {
  handedness: {
    type: Types.Enum,
    enum: { Left: "left", Right: "right" },
    default: "right",
  },
});

export const Target = createComponent("Target", {});

export const HitMarker = createComponent("HitMarker", {});
