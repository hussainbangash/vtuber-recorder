# VTuber Avatar Recorder

A browser-based VTuber tool: load a **VRM** avatar, have it mirror your face in real time from
your webcam, and record it over a solid **green screen** for chroma-keying in any editor.
Everything runs **on-device in the browser** — no backend, no uploads.

> 🚧 Work in progress, built milestone by milestone. Currently at **Milestone 0 (scaffold)**.

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

## Roadmap

- [x] **M0** — Scaffold + live deploy
- [ ] **M1** — Load & display a VRM
- [ ] **M2** — Real-time face tracking (MediaPipe → VRM)
- [ ] **M3** — Mouth / lip sync
- [ ] **M4** — Record avatar + mic to a downloadable video
- [ ] **M5** — Green-screen export polish + portfolio README

## Privacy

All webcam and microphone processing happens locally in your browser. Nothing is uploaded
to any server.

## License

MIT
