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
 *   jawOpen                         ->  aa   (mouth open, the main "talking" shape)
 *   mouthPucker / mouthFunnel       ->  ou   (rounded mouth)
 *   mouthSmileLeft/Right (avg)      ->  happy
 *   browDownLeft/Right (avg)        ->  angry
 *   mouthFrownLeft/Right (avg)      ->  sad
 *   browOuterUpLeft/Right (avg)     ->  surprised
 *
 * Notes:
 *   - MediaPipe's blendshapes are ML-predicted and already smooth, so we only
 *     apply a light lerp to remove residual jitter.
 *   - Visemes beyond `aa`/`ou` (ih/ee/oh) are intentionally left for Milestone 3
 *     (lip-sync) to avoid fighting the `happy` smile shape here.
 *   - HEAD_SIGN flips are the one empirically-tuned bit: head-pose axis
 *     conventions differ between MediaPipe's camera space and VRM. If a movement
 *     looks inverted, flip the matching sign.
 */

const HEAD_SMOOTHING = 0.5; // slerp factor per frame (0 = frozen, 1 = instant)
const EXPRESSION_SMOOTHING = 0.5;
const MAX_HEAD_ANGLE = 0.7; // radians (~40deg) clamp so extreme detections don't snap the neck

/** Sign per axis; flip one if that head movement comes out mirrored/inverted. */
const HEAD_SIGN = { pitch: -1, yaw: -1, roll: 1 } as const;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const clampAngle = (v: number): number => Math.max(-MAX_HEAD_ANGLE, Math.min(MAX_HEAD_ANGLE, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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

  const set = (name: string, target: number): void => {
    const current = em.getValue(name) ?? 0;
    em.setValue(name, lerp(current, clamp01(target), EXPRESSION_SMOOTHING));
  };

  set("blinkLeft", g("eyeBlinkLeft"));
  set("blinkRight", g("eyeBlinkRight"));
  set("aa", g("jawOpen"));
  set("ou", Math.max(g("mouthPucker"), g("mouthFunnel")));
  set("happy", avg("mouthSmileLeft", "mouthSmileRight"));
  set("angry", avg("browDownLeft", "browDownRight"));
  set("sad", avg("mouthFrownLeft", "mouthFrownRight"));
  set("surprised", avg("browOuterUpLeft", "browOuterUpRight"));
}
