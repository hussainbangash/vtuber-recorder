import { useVrmViewer } from "../hooks/useVrmViewer";
import { VrmFilePicker } from "./VrmFilePicker";

export function AvatarStage() {
  const { canvasRef, status, error, loadFile } = useVrmViewer();

  return (
    <div className="stage">
      <canvas ref={canvasRef} className="stage-canvas" />

      <header className="stage-topbar">
        <span className="stage-brand">🎥 VTuber Recorder</span>
        <VrmFilePicker onFile={loadFile} status={status} />
      </header>

      {status !== "loaded" ? (
        <div className={`stage-hint ${status === "error" ? "is-error" : ""}`}>
          {status === "loading"
            ? "Loading avatar…"
            : status === "error"
              ? (error ?? "Something went wrong.")
              : "Load a .vrm avatar to begin"}
        </div>
      ) : null}
    </div>
  );
}
