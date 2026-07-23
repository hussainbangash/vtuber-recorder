import { useCallback, useEffect, useRef, useState } from "react";
import { VrmViewer } from "../lib/vrmViewer";

export type LoadStatus = "idle" | "loading" | "loaded" | "error";

/**
 * Creates a VrmViewer bound to a canvas, keeps it sized to its container, and
 * exposes a `loadFile` action. The Three.js instance lives in a ref (never in
 * React state) so re-renders don't touch the render loop.
 */
export function useVrmViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewerRef = useRef<VrmViewer | null>(null);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const viewer = new VrmViewer(canvas);
    viewerRef.current = viewer;

    return () => {
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  const loadFile = useCallback(async (file: File): Promise<void> => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    setStatus("loading");
    setError(null);
    const url = URL.createObjectURL(file);
    try {
      await viewer.loadVrm(url);
      setStatus("loaded");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to load this file as a VRM.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  return { canvasRef, status, error, loadFile };
}
