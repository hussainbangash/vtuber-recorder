import type { ChangeEvent } from "react";
import type { LoadStatus } from "../hooks/useVrmViewer";

export function VrmFilePicker({
  onFile,
  status,
}: {
  onFile: (file: File) => void;
  status: LoadStatus;
}) {
  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = ""; // allow re-selecting the same file
  }

  const label =
    status === "loading" ? "Loading…" : status === "loaded" ? "Change avatar" : "Load .vrm";

  return (
    <label className="picker">
      {label}
      <input type="file" accept=".vrm" hidden onChange={handleChange} />
    </label>
  );
}
