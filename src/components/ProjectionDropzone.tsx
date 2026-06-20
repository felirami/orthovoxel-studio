import { ImagePlus, X } from "lucide-react";
import type { LoadedProjection, ProjectionSide } from "../types";
import { loadProjectionFromFile } from "../lib/projections";

interface ProjectionDropzoneProps {
  side: ProjectionSide;
  projection?: LoadedProjection;
  onLoad: (projection: LoadedProjection) => void;
  onClear: (side: ProjectionSide) => void;
}

const labels: Record<ProjectionSide, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
  top: "Top",
  bottom: "Bottom"
};

export function ProjectionDropzone({ side, projection, onLoad, onClear }: ProjectionDropzoneProps) {
  async function loadFile(file?: File) {
    if (!file || !file.type.includes("image")) {
      return;
    }

    onLoad(await loadProjectionFromFile(side, file));
  }

  return (
    <label
      className={`projection-dropzone ${projection ? "is-loaded" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void loadFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        type="file"
        accept="image/png,image/webp,image/jpeg"
        onChange={(event) => void loadFile(event.currentTarget.files?.[0])}
      />
      <span className="projection-title">{labels[side]}</span>
      {projection ? (
        <>
          <img src={projection.dataUrl} alt={`${labels[side]} projection`} />
          <button
            className="icon-button projection-clear"
            type="button"
            title={`Clear ${labels[side]}`}
            onClick={(event) => {
              event.preventDefault();
              onClear(side);
            }}
          >
            <X size={15} />
          </button>
          <span className="projection-meta">
            {projection.width} x {projection.height}
          </span>
        </>
      ) : (
        <span className="projection-empty">
          <ImagePlus size={20} />
        </span>
      )}
    </label>
  );
}
