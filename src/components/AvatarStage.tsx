import { useVrmViewer } from "../hooks/useVrmViewer";
import { useFaceTracking } from "../hooks/useFaceTracking";
import { VrmFilePicker } from "./VrmFilePicker";

export function AvatarStage() {
  const { canvasRef, viewerRef, status, error, loadFile } = useVrmViewer();
  const { videoRef, status: track, error: trackError, toggle } = useFaceTracking(viewerRef);

  const cameraLabel =
    track === "loading" ? "Starting…" : track === "on" ? "Stop camera" : "Enable camera";

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="stage-canvas" />

      <header className="stage-topbar">
        <span className="stage-brand">🎥 VTuber Recorder</span>
        <div className="stage-actions">
          <VrmFilePicker onFile={loadFile} status={status} />
          <button
            type="button"
            className="picker"
            onClick={toggle}
            disabled={track === "loading"}
          >
            {cameraLabel}
          </button>
        </div>
      </header>

      {/* Webcam preview (mirrored, like a selfie); hidden until tracking is on. */}
      <video
        ref={videoRef}
        className={`webcam-preview ${track === "on" ? "" : "is-hidden"}`}
        muted
        playsInline
      />

      {status !== "loaded" ? (
        <div className={`stage-hint ${status === "error" ? "is-error" : ""}`}>
          {status === "loading"
            ? "Loading avatar…"
            : status === "error"
              ? (error ?? "Something went wrong.")
              : "Load a .vrm avatar to begin"}
        </div>
      ) : track === "error" ? (
        <div className="stage-hint is-error">{trackError ?? "Camera error."}</div>
      ) : status === "loaded" && track === "off" ? (
        <div className="stage-hint">Avatar loaded — click "Enable camera" to start tracking</div>
      ) : null}
    </div>
  );
}
