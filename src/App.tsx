import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Brush,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FolderOpen,
  Grid3X3,
  Layers3,
  Lock,
  MousePointer2,
  PaintBucket,
  Plus,
  Rotate3D,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  X
} from "lucide-react";
import { VoxelViewport } from "./components/VoxelViewport";
import { createDemoProjections, hydrateProjection, loadProjectionFromFile, stripProjection } from "./lib/projections";
import { buildVoxelModel, deleteVoxels, emptyModel } from "./lib/voxelEngine";
import { downloadDataUrl, downloadText, renderModelToDataUrl, renderSpriteSheet } from "./lib/exporters";
import type { LoadedProjection, ProjectFile, ProjectionSide, ToolMode } from "./types";

const palette = ["#d95a37", "#f2c55c", "#3f94b6", "#284f5a", "#78a95f", "#c64878", "#f4eed8", "#26292a"];

const sideLabels: Record<ProjectionSide, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Side",
  top: "Top",
  bottom: "Bottom"
};

const uploadSides: ProjectionSide[] = ["front", "right", "top", "back", "left", "bottom"];

const toolButtons: Array<{ id: ToolMode; label: string; icon: typeof Brush }> = [
  { id: "paint", label: "Paint", icon: Brush },
  { id: "fill", label: "Fill", icon: PaintBucket },
  { id: "erase", label: "Erase", icon: Eraser },
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "add", label: "Add voxel", icon: Plus }
];

const compassViews = [
  { label: "S", azimuth: 90, tilt: 28 },
  { label: "SW", azimuth: 135, tilt: 34 },
  { label: "W", azimuth: 180, tilt: 28 },
  { label: "NW", azimuth: 225, tilt: 34 },
  { label: "N", azimuth: 270, tilt: 28 },
  { label: "NE", azimuth: 315, tilt: 34 },
  { label: "E", azimuth: 0, tilt: 28 },
  { label: "SE", azimuth: 45, tilt: 34 }
];

const orthoViews = [
  { label: "FR", azimuth: 90, tilt: 0 },
  { label: "LS", azimuth: 180, tilt: 0 },
  { label: "BK", azimuth: 270, tilt: 0 },
  { label: "RS", azimuth: 0, tilt: 0 }
];

export function App() {
  const [projections, setProjections] = useState<Partial<Record<ProjectionSide, LoadedProjection>>>({});
  const [model, setModel] = useState(() => emptyModel(32, 32, 32));
  const [maxAxis, setMaxAxis] = useState(48);
  const [tool, setTool] = useState<ToolMode>("paint");
  const [color, setColor] = useState("#d95a37");
  const [azimuth, setAzimuth] = useState(42);
  const [tilt, setTilt] = useState(34);
  const [showGrid, setShowGrid] = useState(true);
  const [lockedView, setLockedView] = useState(false);
  const [directions, setDirections] = useState(8);
  const [exportSize, setExportSize] = useState(192);
  const [transparent, setTransparent] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const projectInputRef = useRef<HTMLInputElement | null>(null);

  const activeProjectionCount = useMemo(() => Object.values(projections).filter(Boolean).length, [projections]);
  const fillPercent = model.voxels.length > 0 ? Math.round((model.voxels.length / (model.width * model.height * model.depth)) * 100) : 0;

  const rebuild = useCallback(() => {
    const next = buildVoxelModel(projections, maxAxis);
    setModel(next);
    setSelectedKeys(new Set());
    setStatus(`Built ${next.voxels.length.toLocaleString()} voxels from ${next.sourceSides.length} views`);
  }, [maxAxis, projections]);

  useEffect(() => {
    if (activeProjectionCount > 0) {
      rebuild();
    }
  }, [activeProjectionCount, rebuild]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key === "Backspace" || event.key === "Delete") && selectedKeys.size > 0) {
        event.preventDefault();
        deleteSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedKeys]);

  useEffect(() => {
    const unsubscribe = window.orthoVoxelDesktop?.onMenuEvent((eventName) => {
      if (eventName === "new") newProject();
      if (eventName === "open") projectInputRef.current?.click();
      if (eventName === "save") saveProject();
      if (eventName === "rebuild") rebuild();
      if (eventName === "delete-selection") deleteSelection();
      if (eventName === "export-sheet") setExportOpen(true);
      if (eventName === "export-snapshot") void exportSnapshot();
      if (eventName === "view-front") setCamera(90, 0);
      if (eventName === "view-right") setCamera(0, 0);
      if (eventName === "view-top") setCamera(0, 86);
      if (eventName === "view-iso") setCamera(42, 34);
    });

    return () => unsubscribe?.();
  });

  function setCamera(nextAzimuth: number, nextTilt: number) {
    setAzimuth(nextAzimuth);
    setTilt(nextTilt);
  }

  function handleProjectionLoad(projection: LoadedProjection) {
    setProjections((current) => ({ ...current, [projection.side]: projection }));
    setStatus(`${sideLabels[projection.side]} loaded`);
  }

  async function handleProjectionFile(side: ProjectionSide, file?: File) {
    if (!file || !file.type.includes("image")) {
      return;
    }

    handleProjectionLoad(await loadProjectionFromFile(side, file));
  }

  async function loadDemo() {
    const demo = await createDemoProjections();
    setProjections(Object.fromEntries(demo.map((projection) => [projection.side, projection])));
    setStatus("Demo projections loaded");
  }

  function newProject() {
    setProjections({});
    setModel(emptyModel(32, 32, 32));
    setSelectedKeys(new Set());
    setPreviewUrl(null);
    setExportOpen(false);
    setStatus("New project");
  }

  function deleteSelection() {
    if (selectedKeys.size === 0) {
      return;
    }

    setModel((current) => deleteVoxels(current, selectedKeys));
    setSelectedKeys(new Set());
    setStatus("Selection deleted");
  }

  function saveProject() {
    const project: ProjectFile = {
      version: 1,
      name: "orthovoxel-project",
      savedAt: new Date().toISOString(),
      maxAxis,
      projections: Object.values(projections).filter(Boolean).map((projection) => stripProjection(projection)),
      model
    };
    downloadText(JSON.stringify(project, null, 2), "orthovoxel-project.json");
    setStatus("Project saved");
  }

  async function openProject(file?: File) {
    if (!file) {
      return;
    }

    const text = await file.text();
    const project = JSON.parse(text) as ProjectFile;

    if (project.version !== 1) {
      throw new Error("Unsupported project file");
    }

    const hydrated = await Promise.all(project.projections.map(hydrateProjection));
    setMaxAxis(project.maxAxis);
    setProjections(Object.fromEntries(hydrated.map((projection) => [projection.side, projection])));
    setModel(project.model);
    setSelectedKeys(new Set());
    setStatus(`${file.name} opened`);
  }

  async function exportSnapshot() {
    if (model.voxels.length === 0) {
      setStatus("Nothing to export");
      return;
    }

    setStatus("Rendering snapshot...");
    const dataUrl = await renderModelToDataUrl(model, { angle: azimuth, tilt, size: exportSize, transparent });
    setPreviewUrl(dataUrl);
    downloadDataUrl(dataUrl, "orthovoxel-snapshot.png");
    setStatus("Snapshot exported");
  }

  async function exportSheet(nextDirections = directions) {
    if (model.voxels.length === 0) {
      setStatus("Nothing to export");
      return;
    }

    setDirections(nextDirections);
    setStatus(`Rendering ${nextDirections} directions...`);
    const dataUrl = await renderSpriteSheet(model, nextDirections, { tilt, size: exportSize, transparent });
    setPreviewUrl(dataUrl);
    downloadDataUrl(dataUrl, `orthovoxel-${nextDirections}-directions.png`);
    setStatus("Sprite sheet exported");
  }

  return (
    <div className="app-shell">
      <input
        ref={projectInputRef}
        className="hidden-input"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void openProject(event.currentTarget.files?.[0])}
      />

      <header className="topbar">
        <div className="brand">
          <Box size={23} />
          <div>
            <span>OrthoVoxel</span>
            <small>Studio v0.1</small>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="command-button" type="button" onClick={newProject} title="New project">
            <Scissors size={16} />
            New
          </button>
          <button className="command-button" type="button" onClick={() => projectInputRef.current?.click()} title="Open project">
            <FolderOpen size={16} />
            Open
          </button>
          <button className="command-button" type="button" onClick={saveProject} title="Save project">
            <Save size={16} />
            Save
          </button>
        </div>
      </header>

      <main className="studio-workspace">
        <aside className="tool-rail" aria-label="Tool rail">
          <div className="tool-stack">
            {toolButtons.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`tool-button ${tool === item.id ? "is-active" : ""}`}
                  type="button"
                  title={item.label}
                  onClick={() => setTool(item.id)}
                >
                  <Icon size={19} />
                </button>
              );
            })}
          </div>

          <div className="view-stepper">
            <button type="button" title="Previous view" onClick={() => setAzimuth((current) => current - 45)}>
              <ChevronLeft size={17} />
            </button>
            <strong>{Math.round(((azimuth % 360) + 360) % 360)}</strong>
            <button type="button" title="Next view" onClick={() => setAzimuth((current) => current + 45)}>
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="swatch-stack">
            {palette.map((swatch) => (
              <button
                key={swatch}
                className={`swatch ${color === swatch ? "is-active" : ""}`}
                style={{ backgroundColor: swatch }}
                type="button"
                title={swatch}
                onClick={() => setColor(swatch)}
              />
            ))}
            <input className="color-input" type="color" value={color} onChange={(event) => setColor(event.target.value)} title="Custom color" />
          </div>

          <button className="rail-command" type="button" onClick={rebuild} title="Rebuild from projections">
            <Layers3 size={18} />
            <span>Ortho</span>
          </button>
        </aside>

        <section className="stage">
          <div className="canvas-deck">
            <VoxelViewport
              model={model}
              tool={tool}
              color={color}
              selectedKeys={selectedKeys}
              azimuth={azimuth}
              tilt={tilt}
              showGrid={showGrid}
              onModelChange={(nextModel) => {
                setModel(nextModel);
                setStatus(`${nextModel.voxels.length.toLocaleString()} voxels`);
              }}
              onSelectionChange={setSelectedKeys}
              onCameraChange={(nextAzimuth, nextTilt) => {
                if (!lockedView) {
                  setCamera(nextAzimuth, nextTilt);
                }
              }}
            />

            {uploadSides.map((side) => (
              <label key={side} className={`floating-upload upload-${side} ${projections[side] ? "is-loaded" : ""}`}>
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  onChange={(event) => void handleProjectionFile(side, event.currentTarget.files?.[0])}
                />
                <Upload size={14} />
                <span>{sideLabels[side]}</span>
              </label>
            ))}
          </div>

          <div className="bottom-console">
            <div className="direction-strip">
              {compassViews.map((view) => (
                <button key={view.label} type="button" onClick={() => setCamera(view.azimuth, view.tilt)}>
                  {view.label}
                </button>
              ))}
              <span className="strip-divider" />
              {orthoViews.map((view) => (
                <button key={view.label} type="button" onClick={() => setCamera(view.azimuth, view.tilt)}>
                  {view.label}
                </button>
              ))}
            </div>

            <label className="zoom-control">
              <span>Zoom</span>
              <input type="range" min="96" max="512" step="32" value={exportSize} onChange={(event) => setExportSize(Number(event.target.value))} />
              <strong>{Math.round((exportSize / 192) * 100)}%</strong>
            </label>

            <div className="status-strip">
              <span>{status}</span>
              <span>{model.width} x {model.height} x {model.depth}</span>
              <span>{model.voxels.length.toLocaleString()} voxels</span>
              <span>{selectedKeys.size.toLocaleString()} selected</span>
            </div>
          </div>
        </section>

        <aside className="command-panel">
          <button className="panel-command accent" type="button" onClick={() => void loadDemo()}>
            <Sparkles size={16} />
            Examples
          </button>

          <button className="panel-command" type="button" onClick={() => setLockedView((current) => !current)}>
            {lockedView ? <Lock size={16} /> : <Unlock size={16} />}
            {lockedView ? "Locked" : "Free View"}
          </button>

          <label className="panel-range">
            <span>{maxAxis} Grid</span>
            <input type="range" min="16" max="128" step="8" value={maxAxis} onChange={(event) => setMaxAxis(Number(event.target.value))} />
          </label>

          <label className="toggle-command">
            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
            <Grid3X3 size={15} />
            Grid
          </label>

          <button className="panel-command danger" type="button" onClick={newProject}>
            <Trash2 size={16} />
            Clear
          </button>

          <div className="model-readout">
            <div>
              <span>Views</span>
              <strong>{activeProjectionCount}</strong>
            </div>
            <div>
              <span>Fill</span>
              <strong>{fillPercent}%</strong>
            </div>
          </div>

          <button className="panel-command primary" type="button" onClick={() => setExportOpen(true)}>
            <Download size={16} />
            Export
          </button>
          <button className="panel-command" type="button" onClick={saveProject}>
            <Save size={16} />
            Save Model
          </button>
          <button className="panel-command" type="button" onClick={() => projectInputRef.current?.click()}>
            <FolderOpen size={16} />
            Load Model
          </button>
        </aside>
      </main>

      {exportOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setExportOpen(false)}>
          <section className="export-modal" role="dialog" aria-modal="true" aria-label="Export options" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <span>Export Options</span>
              <button type="button" title="Close export options" onClick={() => setExportOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="export-preview-box">
              {previewUrl ? <img src={previewUrl} alt="Latest export preview" /> : <Box size={42} />}
            </div>

            <label className="modal-range">
              <span>Camera Tilt</span>
              <input type="range" min="0" max="86" value={tilt} onChange={(event) => setTilt(Number(event.target.value))} />
              <strong>{Math.round(tilt)} deg</strong>
            </label>

            <label className="modal-range">
              <span>Frame Size</span>
              <select value={exportSize} onChange={(event) => setExportSize(Number(event.target.value))}>
                <option value={96}>96 px</option>
                <option value={128}>128 px</option>
                <option value={192}>192 px</option>
                <option value={256}>256 px</option>
                <option value={512}>512 px</option>
              </select>
            </label>

            <label className="toggle-command">
              <input type="checkbox" checked={transparent} onChange={(event) => setTransparent(event.target.checked)} />
              Alpha
            </label>

            <button type="button" onClick={() => void exportSheet(8)}>8 Directions</button>
            <button type="button" onClick={() => void exportSheet(16)}>16 Directions</button>
            <button type="button" onClick={() => void exportSnapshot()}>Snapshot</button>
            <button type="button" onClick={() => void exportSheet(directions)}>Sprite Sheet</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
