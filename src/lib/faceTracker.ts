import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

// WASM runtime + model. Both are static files fetched once; the webcam frames
// themselves are processed entirely on-device and never leave the browser.
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/**
 * Wraps MediaPipe's Face Landmarker. Configured to emit the two things we need
 * to drive a VRM natively: the 52 ARKit blendshapes and the 4x4 head-pose matrix.
 */
export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private lastResult: FaceLandmarkerResult | null = null;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
    const options = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, options);
    } catch {
      // Fall back to CPU if the GPU delegate isn't available.
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      });
    }
  }

  /**
   * Run detection on the current video frame — but only when the frame actually
   * advanced (the render loop runs faster than the webcam). Returns the latest
   * result so callers can keep applying it between webcam frames.
   */
  update(video: HTMLVideoElement, timeMs: number): FaceLandmarkerResult | null {
    if (!this.landmarker) return null;
    if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      this.lastResult = this.landmarker.detectForVideo(video, timeMs);
    }
    return this.lastResult;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastResult = null;
    this.lastVideoTime = -1;
  }
}
