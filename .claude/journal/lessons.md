# Target Practice — Lessons from the build

Distilled patterns and gotchas from the WebXR target-practice gallery build (Claude Opus 4.7, ~12 user turns over multiple sessions, 4 plan-mode iterations: v0.1 primitives → v2 Kenney GLB assets → v3 scale/reposition → v4 firing effects + recoil). This file is the curated signal; `session-ed036a3a-a00d-4c50-83d9-3f0b88e25842.jsonl` next to it is the full transcript and `checkpoints/.../*.png` are the screenshots that paid for each lesson.

This is not a target-practice tutorial. It is what an IWSDK dev would have wanted to know *before* iterating from a primitive-block scene through real Kenney assets to per-shot VFX — asset cloning, the wrapper-Group recoil trick, debugging effects at 5/sec with `ecs_step`, and three bugs that only surface once a thousand shots are fired.

---

## Before you start

**Plan-mode iteration is the right cadence for VR content builds.** Four plan files were approved across this build, each addressing the previous round's user feedback. Each plan was a focused diff — "swap primitives for GLBs", "scale 3x and shift the corridor", "add effects + recoil and tweak positions" — not a rewrite. The pong-build lesson "plan mode pays for itself when the spec is dense" generalizes: each *iteration* of a content build is dense enough on its own to deserve a plan. Editing the existing plan file in place (per the re-enter-plan-mode flow) is correct; do not start fresh on continuations.

**`iwsdk-planner` skill at cold start, every time.** Loaded before the first `Write` on each iteration. It front-loads the current API surface (`OneHandGrabbable`, `AudioSource.playbackMode`, `AssetManager.getGLTF`, `world.globals`) so the plan can be specific.

**Read GLB binary headers, do not trust visual previews for dimensions.** Subagents reading PNG previews guessed "1m grid module" with low confidence. A 12-line Python script unpacking the GLB JSON chunk and reading accessor `min`/`max` arrays gave exact bounds in 5 seconds:

```python
data = open(path, 'rb').read()
chunk_len = struct.unpack('<I', data[12:16])[0]
gltf = json.loads(data[20:20+chunk_len].decode('utf-8').rstrip('\x00'))
for acc in gltf['accessors']:
    if 'min' in acc and 'max' in acc and len(acc['min']) == 3:
        print(acc['min'], acc['max'])
```

Origin conventions vary even within one Kenney pack: `floor-thick.glb` is base-center with Y from 0→0.2, `target-b-round.glb`'s thinnest axis is X (disc faces ±X, needs 90° Y-rotation to face the player), `blaster-b.glb` has its origin near the grip with the barrel extending in -Z. The visual preview tells you none of these. The binary tells you all of them.

---

## Asset pipeline (Kenney → IWSDK)

**`AssetManager.getGLTF(name)` returns the same `gltf.scene` instance every call — `.clone(true)` per visual instance.** Adding it directly to multiple entities re-parents the same Object3D, so only the *last* placement is visible. Confirmed by inspection: 36 floor-tile entities each calling `getGLTF("floorThick").scene` showed only one tile rendered. Clone deep so each instance has independent transforms; geometry, materials, and textures stay shared by reference (cheap, no GPU duplication). The helper is one function:

```ts
function cloneAsset(name: string): Object3D {
  const gltf = AssetManager.getGLTF(name);
  if (!gltf) throw new Error(`Asset ${name} not loaded`);
  return gltf.scene.clone(true);
}
```

**Stage GLBs with their `Textures/` sidecar.** Kenney GLBs reference `Textures/colormap.png` via relative URI (it's in the JSON chunk as `images[0].uri`). Three.js's GLTFLoader resolves URIs relative to the GLB's URL, so `public/gltf/blaster/blaster-b.glb` looks for `public/gltf/blaster/Textures/colormap.png`. Skip the sidecar and the model loads but is texture-less / pink-default. The blaster-kit and prototype-kit each have their own `colormap.png` — keep them in separate subdirectories.

**Scale, do not multiply.** First v2 pass used 36 small floor tiles (1m × 1m) and stacked walls 2 high (48 walls per side) to fill the 3m × 12m corridor. The user's feedback: "spec says 4 floor pieces — just scale up." A `tile.scale.set(3, 1, 3)` on `floor-thick.glb` (native 1m × 0.2m × 1m) yields exactly the 3m × 0.2m × 3m the spec called for, with 4 instances total. Same for `wall.scale.set(1, 3, 3)` to span one floor tile's z extent at full 3m wall height. Net result: 12 floor + side-wall instances instead of 84.

**The `0.05m wall thickness mismatch` is below the noticeable threshold.** Mixing `wall.glb` (0.2m thick) and `wall-window-small.glb` (0.3m thick) by placing both at the same `x = ±1.6` center pushes the window walls 0.05m further into the corridor. Visually invisible at the working camera angles. Do not over-engineer alignment for sub-decimeter mismatches in low-poly low-fi prototype geometry.

---

## ECS / IWSDK patterns

**`OneHandGrabbable` binds the entity's `object3D` directly via `HandleStore` — wrap the model in a `Group` to free the model for animation.** This is the key architectural move for recoil. The wrapper Group is the entity's `object3D` (controlled by the controller via the grab system's HandleStore). The gun model is the wrapper's `children[0]` (independent local transform — animated by `WeaponSystem` on each shot). Muzzle math reads from the inner model so kick-back/pitch-up automatically displaces the muzzle world position:

```ts
const wrapper = new Group();
const model = cloneAsset('blasterB');
wrapper.add(model);
const entity = world.createTransformEntity(wrapper);
entity.addComponent(OneHandGrabbable, {});  // binds wrapper, not model
// Later, in WeaponSystem:
const gunModel = entity.object3D!.children[0];
gunModel.localToWorld(muzzleOriginScratch.set(0, 0, -0.1));  // recoil-aware
```

**`Handle` is not in the public exports — deep-import it for force-release and hand identity.** Two cases needed it: (1) `world.globals.resetGame()` force-drops held weapons via `Handle.data.instance[entity.index].cancel()` so the round resets cleanly even if the player is still squeezing; (2) `WeaponSystem.identifyHolderHand` reads the captured pointer's `pointerWorldOrigin` from `Handle.data.instance[idx].inputState` and compares to `player.gripSpaces.left/right` to pick the holder. The path is `@iwsdk/core/dist/grab/handles.js`. Type assertion is required (`as unknown as { data: { instance: Array<{ cancel(): void; inputState: Map<...> }> } }`). This is fragile — flag it loudly with a comment so future SDK refactors are easy to follow.

**Manual `Raycaster` is justified for muzzle hitscan; everything else should use `Interactable`.** CLAUDE.md correctly flags `new Raycaster()` as an anti-pattern (skips BVH, doesn't work in XR pointer-events). The exception is "ray from arbitrary world origin/direction" — exactly what muzzle-to-target hitscan is. `Interactable` + `Hovered`/`Pressed` model controller-ray interactions, not gun-barrel rays. Allocate the `Raycaster` in `init()` and reuse, write the comment, move on. The pong build's lesson on the same theme: when the framework primitive doesn't fit the question, name the deviation explicitly.

**Score-ordering at the round-end transition has a one-shot lag bug if you're not careful.** Original code in `WeaponSystem.fireShot`:

```ts
shotsRemaining.value = shotsRemaining.peek() - 1;  // ← decrement first
// ... raycast, score logic ...
currentScore.value = currentScore.peek() + score;   // ← then add score
```

When shot 20 fires, `shotsRemaining` hits 0 *before* the score is added. `GameStateSystem`'s `shotsRemaining.subscribe` fires and persists `bestScore = currentScore.peek()` — but `currentScore` is still the pre-shot-20 value. Final UI showed `Final: 1981` next to `Best: 1882` — internally inconsistent. Fix: reorder so the score is added before `shotsRemaining` is decremented. Verified by re-running with the same SMG burst → `Final: 1981` / `Best: 1981`. Lesson: when a state transition fires on a signal, every signal that the transition reads must be updated before the trigger.

**`time` argument to `update(delta, time)` is `clock.elapsedTime` (seconds), not milliseconds.** Confirmed by reading `init/world-initializer.js:436`. SMG fire rate gating uses `nowMs = time * 1000`. Float32 storage of `nextFireTime` is fine for any practical session length (16M-second precision boundary).

**`Float32` setValue persists across frames.** Per-weapon `recoilElapsed` field accumulates correctly between `update()` calls. Don't over-think this — `componentData[entity.index] = value` with a typed array is the elics implementation; persistence is automatic.

**System priorities matter for the input → simulation → effects → UI pipeline.** Final ordering:
- `GameStateSystem` 0 — owns the signals
- `WeaponSystem` 5 — input read, fire path, recoil tick
- `TargetSystem` 20 — target movement
- `EffectsSystem` 25 — pool ticks for muzzle rings + traces
- `PracticeUISystem` 35 — UI redraw subscribers

Effects must tick *after* the system that triggered them so the spawn happens, then the first frame's animation step happens, then UI updates happen with consistent state.

---

## Object pooling for sub-second VFX

**Pre-allocate everything in `init()`.** 16 ring meshes, 16 trace cylinders, 32 cloned materials (one per slot for independent opacity). Pool root is a single empty `Group` made into an entity via `createTransformEntity` — pool meshes are added as children of that Group's `object3D`. Avoids 32 individual entities while also avoiding raw `scene.add` (the parent IS an entity's `object3D`, so the children participate in the scene without bypassing ECS).

**Materials must be cloned per slot.** Geometry can be shared (read-only buffers, no per-instance state), but `MeshBasicMaterial.opacity` is mutated each frame as the effect fades — every slot needs its own material. Clone once at init (`materialTemplate.clone()`), never per-spawn.

**Pre-allocate scratch `Vector3`/`Quaternion` as instance fields.** Especially the canonical Y-axis for `Quaternion.setFromUnitVectors(YAXIS, dir)` — module-level `new Vector3(0, 1, 0)` is fine; the anti-pattern is `new Vector3(0, 1, 0)` *inside the spawn function*. Effects spawn 5/sec — 5 unnecessary Vector3 allocations per second is a measurable per-second pause when GC fires.

**Cylinder default axis is +Y, length 1.** To draw a trace from `origin` to `end`:

```ts
scratchVec.copy(end).sub(origin);
const length = scratchVec.length();
scratchVec.divideScalar(length);  // normalized direction
mesh.position.copy(origin).addScaledVector(scratchVec, length / 2);  // midpoint
scratchQuat.setFromUnitVectors(YAXIS, scratchVec);
mesh.quaternion.copy(scratchQuat);
mesh.scale.set(1, length, 1);
```

The per-trace cost is 4 Vector3 ops on pre-allocated buffers + one quaternion compose. No allocations.

**Hit marker shared geometry/material is fragile under `entity.dispose()`.** Module-level `markerGeometry` and `markerMaterial` were shared across all 20 hit markers per round. `resetGame` originally called `marker.dispose()` (which cascades through Three.js `geometry.dispose()` / `material.dispose()`) — first reset destroyed the shared GPU buffers; second round's markers had black/invisible geometry. iwsdk-project-code-reviewer caught this. Fix: switch to `marker.destroy()` (entity-level cleanup only, no GPU dispose) since the geometry/material are not owned by the entity. Lesson: `entity.dispose()` is correct for entity-owned resources, not for module-level shared resources.

---

## Recoil math

**`+X rotation` tilts the gun's local -Z (forward) toward +Y (up) — that's the muzzle rise direction.** Verified by Three.js's standard X rotation matrix: applying `rotateX(+θ)` to the local forward vector `(0, 0, -1)` yields `(0, sin θ, -cos θ)` — for small +θ, `+Y` and slightly less `-Z`. So `model.rotation.x = +RECOIL_PITCH * decay` is the right sign. (Got this wrong in the first plan-pass mental model; verified by inspecting the rotation matrix form before shipping.)

**`+Z` is "backward relative to gun" because the barrel is at -Z.** Model kicks back along its own +Z. With identity orientation, that aligns with world +Z (toward the player) — the gun moves toward the player when fired. Subtle but correct: it's the *gun in the player's hand* moving back toward the player's body, not the muzzle moving forward.

**Exponential decay is the right curve, tuned via `tau`.** `decay(t) = exp(-t / RECOIL_TAU)` with `tau = 0.05s` decays to ~13% at 0.10s and ~2% at 0.20s. Visually: instant kick, smooth return, no "kick again at the end" artifact that a sin-based curve has at low durations.

**Constants found by feel:**
- `RECOIL_DURATION = 0.18s`
- `RECOIL_TAU = 0.05s`
- `RECOIL_KICK_Z = 0.06m`
- `RECOIL_PITCH = 0.15rad` (~9°)

First-pass values were half these (3cm, ~6°) and the user could not see the recoil. Tuning is intentionally on the "more visible" side of physically realistic — VR foreshortens motion, especially at gun-in-hand viewing distance.

---

## Target geometry

**`target-b-round.glb` faces ±X (disc normal is along the model's thinnest axis), not ±Z.** First implementation rotated `inner.rotation.y = -Math.PI / 2` and the back of the target faced the player (silhouette only, no rings visible from the player POV). Flipping to `+Math.PI / 2` corrected it. Lesson: do not reason about disc orientation from the bounding-box shape — verify with a screenshot from the player POV after first load. If the back is showing, flip the rotation sign.

**Hit markers must be placed *outside* the disc body, not inside it.** Disc thickness in target-local is ±0.062m. `markerMesh.position.z = 0.028` (first pass) put markers inside the disc geometry — invisible from any angle because the disc's own geometry occluded them. `0.075` is past the disc front face (toward the player); markers visible. Lesson: when "I added a thing but it's not visible," check the offset direction relative to the surface normal, not just the magnitude.

**Scaling the target via root scale propagates to children including markers, hit detection works in target-local.** `root.scale.setScalar(3)` makes the disc 3x larger in world. `worldToLocal` divides world-space hit points by the cumulative scale, so target-local `r = hypot(local.x, local.y)` is back in 0..0.248 range — `TARGET_RADIUS = 0.248` (the native disc radius) is the correct constant whether or not the target is scaled. Markers are children of root, so they auto-scale with the target. Marker geometry `SphereGeometry(0.0117, 8, 8)` × 3x root = 0.035m world radius — the user-requested "1/3 of original" size after scale.

---

## Debugging at 5 shots/second

**`ecs_pause` → trigger fire → `ecs_step(N)` → `browser_screenshot` is the only practical way to inspect sub-second VFX.** SMG fires every 200ms, muzzle ring lifetime is 200ms, trace lifetime is 80ms. By the time a screenshot returns from MCP (~500ms round-trip), the effect is gone and the next 2 shots have already fired. Pausing the world before triggering and stepping single frames freezes the visual state on each phase of the lifetime curve:

1. `ecs_pause`
2. `xr_set_gamepad_state(trigger=1)` — queue the trigger-down edge
3. `ecs_step(1)` — one frame: fire happens, ring/trace at frame 0 of lifetime
4. `browser_screenshot` — captures peak of effect
5. `ecs_step(3)` + screenshot — captures mid-decay
6. `ecs_step(10)` + screenshot — captures recoil decay

The user explicitly suggested this pattern. It generalized immediately. Adopt as the default for any time-sensitive visual verification.

**`browser_reload_page` + `xr_accept_session` is the right post-edit cycle.** HMR on Vite is reliable for the first edit but accumulates module-graph weirdness over an iterative session — by the third or fourth edit on the same hot reload, things start to feel stale. Hard reload is two MCP calls (~3 seconds). Adopt as reflexive.

**Take screenshots from at least 3 angles when validating geometry.** Player POV, side profile, top-down. The "is the wall behind the player rendering?" question went unanswered for two screenshots because I was looking from the player's POV (where the wall is *behind* the camera by definition). Top-down or stepping back to z=-2 with yaw=180 immediately answered it. Visual validation is angle-dependent; one camera shot proves nothing about what's outside its frustum.

**Console logs survive HMR; logs from the previous code are still in the buffer.** Multiple times I saw 404s in `browser_get_console_logs` and worried, only to notice the timestamps were from before a reload. Filter by `since: <recent timestamp>` or just inspect the timestamp before reacting.

---

## Specific gotchas this build earned

**The shotsRemaining-vs-currentScore ordering bug had no symptom on shot 1–19.** Only the 20th shot triggers the GAME_OVER transition; only its score is observed inconsistent. A unit test would have caught this if the SMG were modeled as 20 individual fire calls rather than a sustained-fire loop, but the bug is at the boundary between the per-shot logic and the per-round logic — the kind of bug you only find by playing the game.

**Audio asset paths are case-sensitive and relative to `public/`.** When swapping placeholder `chime.mp3` for ElevenLabs-generated `shot.mp3`, three references needed updating (one in `index.ts` AssetManifest, two in `scene.ts` AudioSource src). `grep -rn "chime.mp3" src/` found them all in 50ms; do that before assuming "I think I changed all of them."

**`AudioContext was not allowed to start` warning is benign in 2D preview, fixes itself in XR.** The browser's autoplay policy blocks audio until first user gesture in 2D mode; entering XR is the gesture. Do not chase this warning.

**Spec dimensions are aspirational; assets are reality.** Spec called for a 2.5m × 0.6m × 0.9m counter; available `crate.glb` is 0.5m cube; user wanted "3 crates scaled 2x" → 3m × 1m × 1m counter. The result is wider than spec (3m vs 2.5m) but visually balanced for the 3m-wide corridor. When asset constraints push outside spec, prefer visual coherence to spec adherence — the spec is a starting point, not a contract. (Re-read the spec sections that say "approximate" or "suggested" before adjusting; these allowed it.)

**The corridor needs a wall behind the player.** v3 plan added a front-wall (behind player) at `z = +1.6` after user feedback. Without it the player feels like they're standing on the edge of an infinite floor. Easy miss when the spec describes a "corridor" and you focus on the forward direction.

**Wall corners (`wall-corner.glb`) are too large to use after 3x scaling.** Native is 1m × 1m × 1m L-shape; scaled 3x is 3m × 3m × 3m, which would replace an entire wall column. The visible "gap at the corner where two walls meet" is sub-decimeter and not worth the geometric awkwardness of scaled-up corner pieces. Skip wall-corners entirely for v3+.

**Panel y > counter top y means panel z is irrelevant for clipping.** Panel at `y = 1.25, maxHeight = 0.32` spans roughly y=1.09–1.41 (with backward tilt). Counter top at y=1.0. The panel never intersects the counter regardless of z — even when z = -1.1 (inside counter footprint along z). Saves a coordinate constraint when laying things out. The blocking-line-of-sight check is separate: use eye-position-to-target-position interpolation at the panel's z to get the line-of-sight y, ensure panel top is below it.

---

## What didn't work so well

**v1 used Three.js primitives for everything; the user wanted real assets in v2.** The v0.1 spec said "use placeholder primitives," but the user's intent was always "real Kenney assets, primitives are for v0.1 because we don't have assets yet." Should have asked at v0.1 planning time: "do you have asset packs in mind, or should I source them?" Would have saved the scrap-and-rebuild between v1 and v2.

**Initial muzzle ring/recoil values were too subtle.** First-pass `RECOIL_KICK_Z = 0.04, RECOIL_PITCH = 0.10` were physically reasonable but visually invisible at 200ms gun-in-hand viewing. VR motion needs to be exaggerated relative to real-world equivalents. Same lesson likely applies to any "realistic" haptic/visual feedback in VR.

**Spent one screenshot pass on a near-empty side view (~12 walls along Z, only 2 visible in frame).** Wide-angle shots from far outside the scene look empty even when populated. Move the camera *along* the corridor's length (not perpendicular to it) to verify a row of repeated objects. Or use top-down. Side profile is for one wall, not a row of walls.

**Score persistence carried across sessions during testing.** localStorage's `targetPractice.bestScore` accumulates from previous sessions, including ones with bugs. After fixing the score-ordering bug, the displayed `Best: 1981` was technically a stale-from-before-fix value that happened to match the new (correct) Final score. Should have cleared `localStorage` before final verification. Not a correctness issue but a "the verification screenshot accidentally shows the bug fixed *and* the bug present" mood.

---

## Pointers into `session-ed036a3a-a00d-4c50-83d9-3f0b88e25842.jsonl`

The full session transcript is alongside this file. JSONL is one event per line — go to the line number directly.

| # | Lesson | Line(s) |
|---|---|---|
| 1 | First plan written + ExitPlanMode (v0.1 primitives) | 30, 32 |
| 2 | `iwsdk-planner` skill loaded before first Write | 18 |
| 3 | GLB binary-header inspection script (wall.glb bounds) | 296 |
| 4 | All prototype-kit dimensions read from accessors | 298 |
| 5 | Blaster-kit dimensions + crate variants | 300 |
| 6 | GLB texture URI is `Textures/colormap.png` (sidecar required) | 302 |
| 7 | Plan-agent flagged `Handle.data.instance[idx].cancel()` for force-drop | 27 |
| 8 | Code-reviewer caught shared `markerGeometry`/`markerMaterial` disposal bug | 125 |
| 9 | Three.js `entity.dispose()` cascades to geometry/material | 126 |
| 10 | Switched `marker.dispose()` → `marker.destroy()` to keep shared GPU buffers alive | 131 |
| 11 | v0.1 implementation done, score-ordering bug found + fixed (`weapon.ts:135`) | 253 |
| 12 | v2 plan approved (Kenney GLB swap) | 315 |
| 13 | `cloneAsset` helper task (`gltf.scene.clone(true)` per instance) | 319 |
| 14 | v2 wrap-up: 36-tile floor + 48-wall stack + 10-crate counter (later corrected) | 431 |
| 15 | Markers inside disc body bug observed | 406 |
| 16 | Target rotation flip and marker z-offset fix (v2 wrap-up) | 431 |
| 17 | User feedback: "scale up, don't multiply" + corridor shift + 3x target | 435 |
| 18 | v3 plan approved (scale + reposition) | 444 |
| 19 | v4 plan approved (firing effects + recoil) | 492 |
| 20 | EffectsSystem task created (16-slot pools) | 493 |
| 21 | Wrap weapons in Group task | 495 |
| 22 | User suggestion: "you can use ecs tools to stop step resume for debugging" → ack | 550 |
| 23 | First `ecs_pause` call | 561 |
| 24 | First `ecs_step` after pause | 563 |
| 25 | v4 wrap-up summary (effects + recoil + ECS pause/step pattern) | 634 |
| 26 | Audio swap user request | 637 |
| 27 | Audio swap completion (`/audio/shot.mp3` + chime deleted) | 646 |
