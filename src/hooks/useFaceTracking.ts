import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { VrmViewer } from "../lib/vrmViewer";
import { FaceTracker } from "../lib/faceTracker";
import { applyFaceToVrm } from "../lib/vrmRig";

export type TrackingStatus = "off" | "loading" | "on" | "error";

/**
 * Manages the webcam + FaceTracker and feeds results into the viewer's render
 * loop via `setFrameHook`. Nothing here runs per-frame in React — the per-frame
 * work happens inside the viewer's requestAnimationFrame loop.
 */
export function useFaceTracking(viewerRef: RefObject<VrmViewer | null>) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef<FaceTracker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<TrackingStatus>("off");
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback((): void => {
    viewerRef.current?.setFrameHook(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackerRef.current?.dispose();
    trackerRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("off");
  }, [viewerRef]);

  const start = useCallback(async (): Promise<void> => {
    const video = videoRef.current;
    if (!video) return;
    setStatus("loading");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      const tracker = new FaceTracker();
      await tracker.init();
      trackerRef.current = tracker;

      // Feed each rendered frame: detect on the webcam, apply to the VRM.
      viewerRef.current?.setFrameHook((vrm) => {
        const result = tracker.update(video, performance.now());
        if (result) applyFaceToVrm(vrm, result);
      });
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the camera.");
      setStatus("error");
      stop();
    }
  }, [viewerRef, stop]);

  const toggle = useCallback((): void => {
    if (status === "on" || status === "loading") stop();
    else void start();
  }, [status, start, stop]);

  useEffect(() => () => stop(), [stop]); // stop the camera on unmount

  return { videoRef, status, error, toggle };
}
