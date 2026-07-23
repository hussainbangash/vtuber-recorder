import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";

/**
 * ============================================================================
 *  The core CV logic: MediaPipe Face Landmarker -> VRM
 * ============================================================================
 *
 * MediaPipe gives us two things per frame, natively:
 *   1. `facialTransformationMatrixes[0]` — a 4x4 matrix of the head's pose.
 *   2. `faceBlendshapes[0].categories`   — 52 ARKit blendshapes, each 0..1.
 *
 * VRM avatars are driven by:
 *   - Humanoid *bones* (we rotate the `head` bone from the pose matrix).
 *   - Named *expression presets* (`blink`, `aa`, `happy`, ...) which we set from
 *     the ARKit blendshapes below.
 *
 * ARKit blendshape (MediaPipe)      ->  VRM expression preset
 *   eyeBlinkLeft / eyeBlinkRight    ->  blinkLeft / blinkRight
 *
 *   Mouth / lip sync (Milestone 3) — MediaPipe's mouth blendshapes are mapped
 *   onto the VRM's five vowel visemes:
 *   jawOpen                         ->  aa   (open "ah", the main talking shape)
 *   mouthFunnel                     ->  oh   (lips forward + open)
 *   mouthPucker                     ->  ou   (lips rounded, "oo")
 *   mouthStretchLeft/Right + open   ->  ih   (corners out + open)
 *   mouthStretchLeft/Right + closed ->  ee   (corners out, teeth, "eee")
 *
 *   Emotions (kept separate from the talking mouth so they don't fight):
 *   mouthSmileLeft/Right (avg)      ->  happy
 *   browDownLeft/Right (avg)        ->  angry
 *   mouthFrownLeft/Right (avg)      ->  sad
 *   browOuterUpLeft/Right (avg)     ->  surprised
 *
 * Notes:
 *   - MediaPipe's blendshapes are ML-predicted and already smooth, so we only
 *     apply a light lerp to remove residual jitter.
 *   - The five visemes are normalized so they never sum past 1, which keeps the
 *     mouth from over-driving into a mush when several fire at once.
 *   - HEAD_SIGN flips are the one empirically-tuned bit: head-pose axis
 *     conventions differ between MediaPipe's camera space and VRM. If a movement
 *     looks inverted, flip the matching sign.
 */

const HEAD_SMOOTHING = 0.5; // slerp factor per frame (0 = frozen, 1 = instant)
const EXPRESSION_SMOOTHING = 0.5;
const BLINK_SMOOTHING = 0.6; // blinks are fast, so react a bit quicker
const MOUTH_SMOOTHING = 0.7; // lip sync should feel snappy, so smooth less
const MAX_HEAD_ANGLE = 0.7; // radians (~40deg) clamp so extreme detections don't snap the neck

/** Sign per axis; flip one if that head movement comes out mirrored/inverted. */
const HEAD_SIGN = { pitch: 1, yaw: -1, roll: 1 } as const;

// MediaPipe's eyeBlink score usually peaks well below 1.0 even when the eye is
// fully shut, which reads as a permanent squint. Remap so a real closure hits 1.0.
const BLINK_IN_MIN = 0.15;
const BLINK_IN_MAX = 0.5;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const clampAngle = (v: number): number => Math.max(-MAX_HEAD_ANGLE, Math.min(MAX_HEAD_ANGLE, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const remapBlink = (v: number): number =>
  clamp01((v - BLINK_IN_MIN) / (BLINK_IN_MAX - BLINK_IN_MIN));

// Reused temporaries so we don't allocate on every animation frame.
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, "YXZ");
const _targetEuler = new THREE.Euler(0, 0, 0, "YXZ");
const _targetQuat = new THREE.Quaternion();

export function applyFaceToVrm(vrm: VRM, result: FaceLandmarkerResult): void {
  applyHeadPose(vrm, result);
  applyExpressions(vrm, result);
}

function applyHeadPose(vrm: VRM, result: FaceLandmarkerResult): void {
  const matrix = result.facialTransformationMatrixes?.[0];
  const head = vrm.humanoid?.getNormalizedBoneNode("head");
  if (!matrix || !head) return;

  _mat.fromArray(matrix.data);
  _quat.setFromRotationMatrix(_mat);
  _euler.setFromQuaternion(_quat, "YXZ");

  _targetEuler.set(
    clampAngle(HEAD_SIGN.pitch * _euler.x),
    clampAngle(HEAD_SIGN.yaw * _euler.y),
    clampAngle(HEAD_SIGN.roll * _euler.z),
    "YXZ"
  );
  _targetQuat.setFromEuler(_targetEuler);
  head.quaternion.slerp(_targetQuat, HEAD_SMOOTHING); // damp toward target
}

function applyExpressions(vrm: VRM, result: FaceLandmarkerResult): void {
  const em = vrm.expressionManager;
  const categories = result.faceBlendshapes?.[0]?.categories;
  if (!em || !categories) return;

  const bs: Record<string, number> = {};
  for (const c of categories) bs[c.categoryName] = c.score;
  const g = (name: string): number => bs[name] ?? 0;
  const avg = (a: string, b: string): number => (g(a) + g(b)) / 2;

  const set = (name: string, target: number, smoothing = EXPRESSION_SMOOTHING): void => {
    const current = em.getValue(name) ?? 0;
    em.setValue(name, lerp(current, clamp01(target), smoothing));
  };

  set("blinkLeft", remapBlink(g("eyeBlinkLeft")), BLINK_SMOOTHING);
  set("blinkRight", remapBlink(g("eyeBlinkRight")), BLINK_SMOOTHING);

  // --- Mouth / lip sync (Milestone 3) --------------------------------------
  // Turn ARKit mouth blendshapes into the VRM's five vowel visemes. Kept apart
  // from the `happy` smile below so speech and expression don't share lip morphs.
  const jaw = g("jawOpen");
  const funnel = g("mouthFunnel"); // lips pushed forward -> "oh"
  const pucker = g("mouthPucker"); // lips rounded/kissy  -> "ou"
  const stretch = avg("mouthStretchLeft", "mouthStretchRight"); // corners out -> ih/ee
  const rounded = Math.max(pucker, funnel);

  // Raw viseme candidates. `aa` is suppressed while the lips are rounded so an
  // "oo" doesn't also read as a wide-open "ah"; ih/ee split on how open the jaw is.
  let aa = jaw * (1 - 0.7 * rounded);
  let oh = funnel * (0.4 + 0.6 * jaw);
  let ou = pucker;
  let ih = stretch * jaw;
  let ee = stretch * (1 - jaw);

  // Normalize so the visemes never sum past 1 (prevents an over-driven mouth
  // when several fire together); preserve their ratios.
  const sum = aa + ih + ou + ee + oh;
  if (sum > 1) {
    aa /= sum;
    ih /= sum;
    ou /= sum;
    ee /= sum;
    oh /= sum;
  }

  set("aa", aa, MOUTH_SMOOTHING);
  set("ih", ih, MOUTH_SMOOTHING);
  set("ou", ou, MOUTH_SMOOTHING);
  set("ee", ee, MOUTH_SMOOTHING);
  set("oh", oh, MOUTH_SMOOTHING);

  set("happy", avg("mouthSmileLeft", "mouthSmileRight"));
  set("angry", avg("browDownLeft", "browDownRight"));
  set("sad", avg("mouthFrownLeft", "mouthFrownRight"));
  set("surprised", avg("browOuterUpLeft", "browOuterUpRight"));
}
