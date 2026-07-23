# VTuber Avatar Recorder

A browser-based VTuber tool: load a **VRM** avatar, have it mirror your face in real time from
your webcam, and record it over a solid **green screen** for chroma-keying in any editor.
Everything runs **on-device in the browser** — no backend, no uploads.

> 🚧 Work in progress, built milestone by milestone. Currently at **Milestone 2 (face tracking)**.

## Stack

- TypeScript (strict) · React · Vite
- Three.js + [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) — load & animate the avatar
- [@mediapipe/tasks-vision](https://developers.google.com/mediapipe) Face Landmarker — webcam →
  blendshapes + head-pose, on-device
- Native Web APIs — `getUserMedia`, `canvas.captureStream()`, `MediaRecorder`

## How to run locally

```powershell
npm install
npm run dev
```

Then open the printed `localhost` URL.

## How the face tracking works (the core CV logic)

MediaPipe's **Face Landmarker** (`@mediapipe/tasks-vision`) runs on the webcam in the browser
and, per frame, natively outputs two things:

1. **52 ARKit-style blendshapes** (`jawOpen`, `eyeBlinkLeft`, `mouthSmileLeft`, …), each `0..1`.
2. A **4×4 facial transformation matrix** — the head's pose.

We map those onto the VRM ([`src/lib/vrmRig.ts`](src/lib/vrmRig.ts)):

- **Head pose** — decode the matrix to a rotation and apply it to the VRM `head` bone (damped,
  clamped). A `HEAD_SIGN` config flips per-axis signs, since MediaPipe's camera space and VRM's
  local space differ.
- **Expressions** — map ARKit blendshapes to VRM expression presets:

  | ARKit (MediaPipe) | VRM preset |
  |---|---|
  | `eyeBlinkLeft` / `eyeBlinkRight` | `blinkLeft` / `blinkRight` |
  | `jawOpen` | `aa` (mouth open) |
  | `mouthPucker` / `mouthFunnel` | `ou` |
  | `mouthSmileLeft/Right` | `happy` |
  | `browDownLeft/Right` | `angry` |
  | `mouthFrownLeft/Right` | `sad` |
  | `browOuterUpLeft/Right` | `surprised` |

Because MediaPipe already predicts ARKit blendshapes, no landmark-solving library (e.g. Kalidokit)
is needed — the mapping is direct and explicit.

## Roadmap

- [x] **M0** — Scaffold + live deploy
- [x] **M1** — Load & display a VRM
- [x] **M2** — Real-time face tracking (MediaPipe → VRM)
- [ ] **M3** — Mouth / lip sync
- [ ] **M4** — Record avatar + mic to a downloadable video
- [ ] **M5** — Green-screen export polish + portfolio README

## Privacy

All webcam processing happens **locally in your browser** — the video frames are never uploaded.
Only MediaPipe's static WASM runtime and model file are fetched (once) from a CDN; your camera
stream stays on-device.

## License

MIT
