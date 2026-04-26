# Target Practice WebXR Experience Spec

**Version:** 0.1  
**Target Platform:** WebXR  
**SDK:** IWSDK  
**Experience Type:** Stationary VR target-practice prototype

---

## 1. Overview

This experience is a small stationary WebXR target-practice game. The player stands at one end of a narrow corridor behind a counter. Two guns are placed on the counter: a semi-automatic handgun and an automatic SMG. The player can grab either weapon with the controller grip/squeeze input, aim at a target at the far end of the corridor, and fire until a shared pool of 20 shots is exhausted.

Each shot is scored based on how close it lands to the center of the target. Successful hits appear immediately as small red spheres on the target surface. After the 20th shot, the round ends, shooting is disabled, and the target moves toward the player so they can inspect their hit pattern. The UI then shows the final score, the best saved score, and a New Game button.

---

## 2. Design Goals

- Create a simple and readable WebXR interaction loop.
- Keep the player stationary; no locomotion is required.
- Use a modular corridor layout based on 3m x 3m square floor tiles.
- Support easy replacement of placeholder primitives with asset-pack tiles later.
- Make the weapon interactions feel clear: grip to pick up, trigger to shoot.
- Keep the first version scoped: no reloading, no moving targets, no enemy logic, no progression system.

---

## 3. Player Experience

1. Player enters the XR session.
2. Player is positioned behind a counter at one end of the corridor.
3. A handgun and SMG are visible on the counter.
4. A target is visible at the far end of the corridor.
5. UI panel shows shots left, current score, and a Restart button.
6. Player grabs either gun with grip/squeeze.
7. Gun snaps into the player's hand.
8. Player aims and fires with trigger.
9. Each fired shot consumes 1 shot from the shared 20-shot pool.
10. Hits immediately appear as small red spheres on the target.
11. After 20 shots, the round ends.
12. Target moves toward the player for inspection.
13. UI shows final score, best score, and a New Game button.
14. New Game resets the round, clears markers, returns weapons, and moves the target back to the end of the corridor.

---

## 4. Environment Layout

### 4.1 Coordinate Assumptions

Use standard Three.js/WebXR world orientation:

- Player starts near world origin.
- Player faces down the negative Z axis.
- X axis is left/right.
- Y axis is up/down.
- Z axis is depth along the corridor.

### 4.2 Corridor Dimensions

The corridor is built from square tile units.

| Item | Value |
|---|---:|
| Tile size | 3m x 3m |
| Corridor width | 3m |
| Corridor length | 12m |
| Number of floor tiles | 4 |
| Corridor X bounds | -1.5m to 1.5m |
| Corridor Z bounds | 0m to -12m |

### 4.3 Main Object Positions

| Object | Suggested Position | Notes |
|---|---:|---|
| Player origin | `(0, 0, 0)` | Player begins at near side of corridor. |
| Counter | `(0, 0.45, -0.8)` | Center point of counter mesh. |
| UI panel | `(0, 1.55, -1.25)` | Floating or mounted above/behind counter. |
| Target active position | `(0, 1.5, -11.0)` | Far end of corridor. |
| Target review position | `(0, 1.5, -2.0)` | Moves close to player after round ends. |

### 4.4 Counter

| Property | Value |
|---|---:|
| Width | 2.5m |
| Depth | 0.6m |
| Height | 0.9m |

The counter acts as a visual and spatial boundary. The player should not need to move beyond it.

### 4.5 Initial Visual Style

Prototype geometry should be simple:

- Floor: four 3m x 3m square tiles.
- Walls: simple rectangular planes or boxes.
- Ceiling: optional.
- Counter: rectangular box.
- Target: circular board with visual rings.
- Guns: placeholder meshes or imported primitive gun models.

Asset-pack replacement should be easy later. Keep floor tile placement aligned to the 3m grid.

---

## 5. Player Movement

There is no artificial locomotion in this prototype.

Disabled for v0.1:

- Teleport locomotion.
- Smooth locomotion.
- Snap turn locomotion.
- Climbing or movement interactions.

The player can naturally move within their physical play space, but the gameplay is designed around a fixed position behind the counter.

---

## 6. Controls

### 6.1 Core Controls

| Action | Input |
|---|---|
| Pick up weapon | Grip / squeeze |
| Release weapon | Release grip / squeeze |
| Fire weapon | Trigger |
| Press UI button | XR pointer / UI interaction |

### 6.2 IWSDK Input Intent

- Use grip/squeeze input for grabbing weapons.
- Use trigger input for firing.
- Attach held weapons to the controller/hand grip space rather than the ray space.
- Use XR pointer events for UI button interaction.

---

## 7. Weapons

There are two weapons on the counter: one handgun and one SMG.

### 7.1 Shared Weapon Rules

- Only held weapons can fire.
- Weapons fire using hitscan raycasts, not physical projectile simulation.
- Shots originate from the weapon muzzle.
- Shot direction follows the weapon muzzle forward vector.
- Every fired shot decrements the shared shots remaining count by 1.
- A shot consumes ammo whether it hits or misses.
- Reloading is not supported.
- Firing is disabled when shots remaining reaches 0.
- Firing is disabled in the Game Over state.

### 7.2 Handgun

| Property | Value |
|---|---|
| Type | Semi-automatic |
| Fire input | Trigger press |
| Fire behavior | One shot per trigger-down edge |
| Ammo | Shared 20-shot pool |
| Reloading | None |

The handgun should only fire once per distinct trigger press. Holding the trigger should not continue firing.

### 7.3 SMG

| Property | Value |
|---|---|
| Type | Automatic |
| Fire input | Trigger hold |
| Fire behavior | Continuous fire while trigger is held |
| Fire rate | 5 shots per second |
| Shot interval | 0.2 seconds |
| Ammo | Shared 20-shot pool |
| Reloading | None |

The SMG fires repeatedly while the trigger is held, limited by a 0.2 second shot interval.

### 7.4 Weapon Pickup Behavior

- Weapons begin on the counter at predefined rest positions.
- Player grabs a weapon using grip/squeeze.
- When grabbed, the weapon snaps into the player's hand.
- Snapping should apply a predefined position and rotation offset so the weapon sits naturally in the hand.
- A weapon can be held by only one hand at a time.
- For v0.1, two-handed weapon handling is out of scope.

### 7.5 Weapon Drop Behavior

When the player releases a weapon:

1. Weapon detaches from the hand.
2. Weapon returns to its original counter position.
3. Weapon resets to its original counter rotation.
4. Weapon becomes available to grab again.

The return can be instantaneous or animated. For v0.1, either is acceptable, but a short smooth return animation is preferred if easy.

### 7.6 Suggested Weapon Rest Positions

| Weapon | Position | Rotation Notes |
|---|---:|---|
| Handgun | `(-0.45, 0.95, -0.8)` | Lying on counter, muzzle facing down corridor. |
| SMG | `(0.45, 0.95, -0.8)` | Lying on counter, muzzle facing down corridor. |

---

## 8. Shooting and Hit Detection

### 8.1 Shot Processing

When a weapon fires:

1. Verify game state is `PLAYING`.
2. Verify weapon is currently held.
3. Verify `shotsRemaining > 0`.
4. Decrement `shotsRemaining` by 1.
5. Cast a ray from the weapon muzzle along the muzzle forward direction.
6. Check intersection with target hit area.
7. If hit, calculate hit score and create a marker.
8. If miss, score 0 and create no marker.
9. Add shot score to `currentScore`.
10. Record shot data.
11. Update UI.
12. If `shotsRemaining === 0`, enter Game Over.

### 8.2 Hitscan Raycast

Use hitscan raycast for v0.1.

- No bullet travel time.
- No gravity or ballistic drop.
- No physical projectile collisions.
- Optional tracer visual can be added for feedback, but gameplay should use the raycast result.

### 8.3 Shot Record Data

Each shot should be recorded, including misses.

```ts
interface ShotRecord {
  shotIndex: number;
  weaponType: 'handgun' | 'smg';
  didHit: boolean;
  score: number;
  worldHitPoint?: THREE.Vector3;
  targetLocalHitPoint?: THREE.Vector3;
  distanceFromCenter?: number;
  timestampMs: number;
}
```

---

## 9. Target

### 9.1 Target Geometry

| Property | Value |
|---|---:|
| Shape | Circular board or circular hit area on board |
| Radius | 0.6m |
| Diameter | 1.2m |
| Center active position | `(0, 1.5, -11.0)` |
| Center review position | `(0, 1.5, -2.0)` |

The target should face the player. If the player faces negative Z, the target face should face positive Z.

### 9.2 Visual Rings

Target should display rings to communicate accuracy, but scoring is smooth rather than ring-based.

Suggested visual ring radii:

| Ring | Radius |
|---|---:|
| Center bullseye | 0.06m |
| Inner ring | 0.18m |
| Middle ring | 0.36m |
| Outer ring | 0.60m |

### 9.3 Target Movement

Target has two major positions:

- Active/firing position: far end of corridor.
- Review/game-over position: near the player.

When entering Game Over:

- Target moves from active position to review position.
- Movement should be smooth.
- Suggested duration: 1.0 second.
- Hit markers remain attached and visible.

When starting a new round:

- Target moves back to active position.
- Markers are cleared before or during the move back.
- Shooting should only resume once state is reset to `PLAYING`.

---

## 10. Hit Markers

### 10.1 Marker Behavior

- Hit markers appear immediately when a shot hits the target.
- Markers are small red spheres.
- Markers are parented to the target so they move with it.
- Markers remain visible throughout the round and during Game Over review.
- Markers are removed when Restart/New Game is pressed.

### 10.2 Marker Appearance

| Property | Value |
|---|---:|
| Shape | Sphere |
| Color | Red |
| Radius | 0.035m |
| Placement | Slightly above target surface |
| Surface offset | 0.005m to 0.01m |

Use a small surface offset to avoid z-fighting with the target mesh.

---

## 11. Scoring

### 11.1 Scoring Model

Scoring is smooth and based on distance from the center of the target.

- Center hit gives 100 points.
- Hit at the target edge gives 0 points.
- Miss gives 0 points.
- Total score is the sum of all 20 shots.
- Maximum possible score is 2000.

### 11.2 Formula

Let:

- `r` = distance from hit point to target center in target-local X/Y plane.
- `R` = target radius, 0.6m.

If the shot misses:

```ts
shotScore = 0;
```

If the shot hits:

```ts
normalizedDistance = r / R;
shotScore = Math.max(0, Math.round(100 * (1 - normalizedDistance)));
```

Clamp the result to the range `[0, 100]`.

### 11.3 Score Persistence

Best score is saved to browser local storage.

Suggested key:

```txt
targetPractice.bestScore
```

On Game Over:

1. Read previous best score from local storage.
2. Compare current score to best score.
3. If current score is greater, save current score as new best score.
4. UI displays the updated best score.

---

## 12. Game State

### 12.1 State Enum

```ts
type GameState = 'PLAYING' | 'GAME_OVER';
```

### 12.2 State: PLAYING

This is the initial state after entering the XR session and after starting a new round.

Behavior:

- Target is at the far end of the corridor.
- Shots remaining is 20.
- Current score is 0.
- Hit markers are cleared.
- Guns are available on the counter.
- Player can grab guns.
- Player can shoot held guns.
- UI shows active round information.

UI:

```txt
Shots Left: 20
Score: 0
[Restart]
```

### 12.3 State: GAME_OVER

Entered immediately after the 20th shot is processed.

Behavior:

- Shooting is disabled.
- Target moves to the review position.
- Hit markers remain visible.
- Current score is finalized.
- Best score is updated if needed.
- UI switches to final round information.

UI:

```txt
Round Complete
Final Score: X
Best Score: Y
[New Game]
```

---

## 13. Restart and New Game

### 13.1 Restart During PLAYING

Pressing Restart during active play should:

1. Set game state to `PLAYING`.
2. Reset `shotsRemaining` to 20.
3. Reset `currentScore` to 0.
4. Clear all shot records.
5. Clear all hit markers.
6. Move target to active position.
7. Return weapons to counter positions.
8. Update UI.

### 13.2 New Game During GAME_OVER

Pressing New Game during Game Over should:

1. Set game state to `PLAYING`.
2. Reset `shotsRemaining` to 20.
3. Reset `currentScore` to 0.
4. Clear all shot records.
5. Clear all hit markers.
6. Move target back to active position.
7. Return weapons to counter positions.
8. Update UI.

Functionally, Restart and New Game perform the same reset. The label changes based on game state.

---

## 14. UI Panel

### 14.1 Placement

| Property | Value |
|---|---:|
| Position | `(0, 1.55, -1.25)` |
| Width | 0.8m to 1.0m |
| Height | 0.35m to 0.5m |
| Orientation | Faces player |

The UI should be comfortably readable from the starting position and should not block the target.

### 14.2 Playing UI Content

```txt
TARGET PRACTICE
Shots Left: {shotsRemaining}
Score: {currentScore}
[Restart]
```

### 14.3 Game Over UI Content

```txt
ROUND COMPLETE
Final Score: {currentScore}
Best Score: {bestScore}
[New Game]
```

### 14.4 UI Behavior

- UI updates immediately after every shot.
- Restart button is always available during `PLAYING`.
- New Game button is available during `GAME_OVER`.
- Button should be usable with XR pointer interaction.

---

## 15. Feedback

### 15.1 Required Feedback

- Gunshot sound when firing.
- Hit marker appears immediately on successful target hit.
- UI shot count updates immediately.
- UI score updates immediately.

### 15.2 Preferred Feedback

- Different sound for handgun and SMG.
- Small muzzle flash when firing.
- Optional short tracer line from muzzle to hit/miss direction.
- Hit sound when the target is hit.
- Button press sound for Restart/New Game.

### 15.3 Out of Scope Feedback

- Realistic recoil simulation.
- Realistic firearm handling.
- Bullet casing ejection.
- Reload animations.
- Detailed weapon ballistics.

---

## 16. Technical Implementation Notes

### 16.1 Suggested Runtime State

```ts
interface GameRuntimeState {
  gameState: 'PLAYING' | 'GAME_OVER';
  shotsRemaining: number;
  currentScore: number;
  bestScore: number;
  shotRecords: ShotRecord[];
  activeHeldWeapons: Record<'left' | 'right', WeaponId | null>;
}
```

### 16.2 Suggested Weapon Config

```ts
type WeaponType = 'handgun' | 'smg';

type WeaponId = 'handgun_01' | 'smg_01';

interface WeaponConfig {
  id: WeaponId;
  type: WeaponType;
  displayName: string;
  automatic: boolean;
  fireRateShotsPerSecond?: number;
  restPosition: THREE.Vector3;
  restRotation: THREE.Euler;
  handPositionOffset: THREE.Vector3;
  handRotationOffset: THREE.Euler;
}
```

Handgun config:

```ts
{
  id: 'handgun_01',
  type: 'handgun',
  displayName: 'Handgun',
  automatic: false
}
```

SMG config:

```ts
{
  id: 'smg_01',
  type: 'smg',
  displayName: 'SMG',
  automatic: true,
  fireRateShotsPerSecond: 5
}
```

### 16.3 Suggested Systems

| System | Responsibility |
|---|---|
| `GameStateSystem` | Tracks round state, score, shot count, reset, and game over. |
| `WeaponGrabSystem` | Handles grab/release, hand attachment, and return-to-counter behavior. |
| `WeaponFireSystem` | Handles trigger input, fire rate, raycast, shot records, and ammo consumption. |
| `TargetSystem` | Handles target hit detection, marker placement, and target movement. |
| `ScoreSystem` | Calculates smooth per-shot score. |
| `PracticeUISystem` | Updates spatial UI and handles Restart/New Game button. |
| `PersistenceSystem` | Reads/writes best score from local storage. |
| `FeedbackSystem` | Handles sounds, muzzle flash, tracers, and hit feedback. |

### 16.4 Input Handling Details

Handgun:

- Fire on trigger-down edge only.
- Ignore continued trigger hold.

SMG:

- Fire while trigger is held.
- Maintain an accumulator or next-fire timestamp.
- Fire at most once every 0.2 seconds.
- Stop firing immediately when trigger is released, shots reach 0, or game state changes.

Pseudo-logic:

```ts
if (weapon.type === 'handgun') {
  if (triggerDownThisFrame) {
    fireShot(weapon);
  }
}

if (weapon.type === 'smg') {
  if (triggerHeld && now >= nextAllowedShotTime) {
    fireShot(weapon);
    nextAllowedShotTime = now + 0.2;
  }
}
```

### 16.5 Game Over Transition

After shot 20:

```ts
if (shotsRemaining === 0) {
  gameState = 'GAME_OVER';
  disableWeaponFiring();
  updateBestScore();
  moveTargetToReviewPosition();
  updateGameOverUI();
}
```

---

## 17. Acceptance Criteria

### 17.1 Environment

- Corridor is exactly 3m wide and 12m long.
- Floor is built from four 3m x 3m square tile units.
- Counter is visible near the player.
- Target is visible at the far end of the corridor.

### 17.2 Weapon Interaction

- Player can grab handgun using grip/squeeze.
- Player can grab SMG using grip/squeeze.
- Grabbed weapon snaps into the hand.
- Releasing a weapon returns it to the counter.
- Handgun fires one shot per trigger press.
- SMG fires continuously while trigger is held.
- SMG fires at 5 shots per second.

### 17.3 Shooting

- Round starts with 20 shared shots.
- Every shot consumes 1 shared shot.
- Misses consume shots.
- Shots cannot be fired after 20 shots are consumed.
- Hits create immediate red sphere markers on the target.
- Score updates after every shot.

### 17.4 Game Over

- Game enters Game Over immediately after the 20th shot.
- Target moves to review position.
- UI shows final score and best score.
- Best score persists in browser local storage.
- New Game resets the round.

### 17.5 Reset

- Restart/New Game resets score to 0.
- Restart/New Game resets shots remaining to 20.
- Restart/New Game clears hit markers.
- Restart/New Game returns target to far position.
- Restart/New Game returns guns to counter.

---

## 18. Out of Scope for v0.1

- Reloading.
- Magazine management.
- Ammo pickups.
- Weapon recoil simulation.
- Weapon upgrades.
- Moving targets.
- Multiple target lanes.
- Multiple rounds or campaign progression.
- Online leaderboard.
- Multiplayer.
- Physical bullet ballistics.
- Realistic firearm training features.
- Advanced physics interactions.
- Full asset-pack art pass.

---

## 19. Future Enhancements

Potential follow-up features after v0.1:

- Timed mode.
- Accuracy percentage.
- Per-weapon score breakdown.
- Shot grouping visualization.
- Ring labels on the target.
- Moving target variants.
- Multiple corridor themes.
- Asset-pack replacement for floor, wall, and counter modules.
- Haptic feedback on fire and hit.
- Optional recoil animation.
- Local leaderboard history, not just best score.

---

## 20. Open Questions

No blocking questions for v0.1.

Confirmed decisions:

- Hit markers appear immediately.
- Ammo is shared between both weapons.
- Scoring is smooth distance-based scoring.
- Dropped weapons return to the counter.
- SMG fires at 5 shots per second.
