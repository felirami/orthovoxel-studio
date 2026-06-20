import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { ToolMode, Voxel, VoxelModel } from "../types";
import { addVoxelAt, floodFillVoxels, removeVoxel, setVoxelColor, voxelKey } from "../lib/voxelEngine";

interface VoxelViewportProps {
  model: VoxelModel;
  tool: ToolMode;
  color: string;
  selectedKeys: Set<string>;
  azimuth: number;
  tilt: number;
  showGrid: boolean;
  onModelChange: (model: VoxelModel) => void;
  onSelectionChange: (keys: Set<string>) => void;
  onCameraChange: (azimuth: number, tilt: number) => void;
}

interface ViewportState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  grid: THREE.GridHelper;
  meshGroup?: THREE.Group;
  meshes?: THREE.InstancedMesh[];
  geometry?: THREE.BoxGeometry;
  materials?: THREE.MeshBasicMaterial[];
  animationFrame?: number;
}

export function VoxelViewport({
  model,
  tool,
  color,
  selectedKeys,
  azimuth,
  tilt,
  showGrid,
  onModelChange,
  onSelectionChange,
  onCameraChange
}: VoxelViewportProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<ViewportState | null>(null);
  const meshVoxelLookupRef = useRef<WeakMap<THREE.InstancedMesh, Voxel[]>>(new WeakMap());
  const modelRef = useRef(model);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const selectedRef = useRef(selectedKeys);
  const cameraRef = useRef({ azimuth, tilt });
  const dragRef = useRef({ active: false, startX: 0, startY: 0, azimuth, tilt, moved: false });

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  useEffect(() => {
    selectedRef.current = selectedKeys;
  }, [selectedKeys]);

  useEffect(() => {
    cameraRef.current = { azimuth, tilt };
  }, [azimuth, tilt]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x171816, 1);
    renderer.domElement.className = "viewport-canvas";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 2.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(3, 8, 5);
    scene.add(keyLight);
    const coolLight = new THREE.DirectionalLight(0xc4e9ff, 0.7);
    coolLight.position.set(-5, 3, -3);
    scene.add(coolLight);

    const camera = new THREE.OrthographicCamera();
    const grid = new THREE.GridHelper(64, 64, 0x4b4f49, 0x2a2d29);
    grid.position.y = -0.51;
    scene.add(grid);

    stateRef.current = { renderer, scene, camera, grid };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
      updateCamera();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const animate = () => {
      stateRef.current?.renderer.render(scene, camera);
      if (stateRef.current) {
        stateRef.current.animationFrame = requestAnimationFrame(animate);
      }
    };
    animate();

    const handlePointerDown = (event: PointerEvent) => {
      dragRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        azimuth: cameraRef.current.azimuth,
        tilt: cameraRef.current.tilt,
        moved: false
      };
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current.active) {
        return;
      }

      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;

      if (Math.abs(dx) + Math.abs(dy) < 4) {
        return;
      }

      dragRef.current.moved = true;

      if (event.buttons === 2 || event.altKey || event.metaKey || event.button === 2) {
        onCameraChange(
          dragRef.current.azimuth + dx * 0.35,
          THREE.MathUtils.clamp(dragRef.current.tilt + dy * 0.22, 5, 86)
        );
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      renderer.domElement.releasePointerCapture(event.pointerId);

      if (!dragRef.current.moved) {
        handleEditClick(event);
      }

      dragRef.current.active = false;
    };

    const preventContextMenu = (event: MouseEvent) => event.preventDefault();

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("contextmenu", preventContextMenu);

    return () => {
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("contextmenu", preventContextMenu);
      if (stateRef.current?.animationFrame) {
        cancelAnimationFrame(stateRef.current.animationFrame);
      }
      disposeMesh();
      renderer.dispose();
      renderer.domElement.remove();
      stateRef.current = null;
    };
  }, [onCameraChange]);

  useEffect(() => {
    rebuildMesh();
  }, [model, selectedKeys]);

  useEffect(() => {
    updateCamera();
  }, [azimuth, tilt, model.width, model.height, model.depth]);

  useEffect(() => {
    const state = stateRef.current;

    if (state) {
      state.grid.visible = showGrid;
    }
  }, [showGrid]);

  function disposeMesh() {
    const state = stateRef.current;

    if (!state) {
      return;
    }

    if (state.meshGroup) {
      state.scene.remove(state.meshGroup);
      state.geometry?.dispose();
      state.materials?.forEach((material) => material.dispose());
      state.meshGroup = undefined;
      state.meshes = undefined;
      state.geometry = undefined;
      state.materials = undefined;
      meshVoxelLookupRef.current = new WeakMap();
    }
  }

  function rebuildMesh() {
    const state = stateRef.current;

    if (!state) {
      return;
    }

    disposeMesh();
    if (model.voxels.length === 0) {
      return;
    }

    const geometry = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    const matrix = new THREE.Matrix4();
    const offsetX = (model.width - 1) / 2;
    const offsetY = (model.height - 1) / 2;
    const offsetZ = (model.depth - 1) / 2;
    const group = new THREE.Group();
    const materials: THREE.MeshBasicMaterial[] = [];
    const meshes: THREE.InstancedMesh[] = [];
    const byColor = new Map<string, Voxel[]>();

    model.voxels.forEach((voxel) => {
      const displayColor = selectedKeys.has(voxelKey(voxel)) ? "#ffcc3d" : voxel.color;
      const voxels = byColor.get(displayColor) ?? [];
      voxels.push(voxel);
      byColor.set(displayColor, voxels);
    });

    byColor.forEach((voxels, displayColor) => {
      const material = new THREE.MeshBasicMaterial({ color: displayColor });
      const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);

      voxels.forEach((voxel, index) => {
        matrix.makeTranslation(voxel.x - offsetX, voxel.y - offsetY, voxel.z - offsetZ);
        mesh.setMatrixAt(index, matrix);
      });

      mesh.instanceMatrix.needsUpdate = true;
      meshVoxelLookupRef.current.set(mesh, voxels);
      group.add(mesh);
      meshes.push(mesh);
      materials.push(material);
    });

    state.meshGroup = group;
    state.meshes = meshes;
    state.geometry = geometry;
    state.materials = materials;
    state.scene.add(group);
  }

  function updateCamera() {
    const state = stateRef.current;
    const host = hostRef.current;

    if (!state || !host) {
      return;
    }

    const rect = host.getBoundingClientRect();
    const aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
    const maxAxis = Math.max(modelRef.current.width, modelRef.current.height, modelRef.current.depth, 1);
    const frustum = maxAxis * 1.85;
    state.camera.left = (-frustum * aspect) / 2;
    state.camera.right = (frustum * aspect) / 2;
    state.camera.top = frustum / 2;
    state.camera.bottom = -frustum / 2;
    state.camera.near = -maxAxis * 8;
    state.camera.far = maxAxis * 8;

    const theta = THREE.MathUtils.degToRad(cameraRef.current.azimuth);
    const elevation = THREE.MathUtils.degToRad(cameraRef.current.tilt);
    const radius = maxAxis * 3;
    state.camera.position.set(
      Math.cos(theta) * Math.cos(elevation) * radius,
      Math.sin(elevation) * radius,
      Math.sin(theta) * Math.cos(elevation) * radius
    );
    state.camera.lookAt(0, 0, 0);
    state.camera.updateProjectionMatrix();
  }

  function handleEditClick(event: PointerEvent) {
    const state = stateRef.current;

    if (!state?.meshGroup || modelRef.current.voxels.length === 0) {
      return;
    }

    const rect = state.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, state.camera);
    const [hit] = raycaster.intersectObject(state.meshGroup, true);

    if (!hit || hit.instanceId === undefined) {
      return;
    }

    const hitMesh = hit.object as THREE.InstancedMesh;
    const voxel = meshVoxelLookupRef.current.get(hitMesh)?.[hit.instanceId];

    if (!voxel) {
      return;
    }
    const activeTool = toolRef.current;

    if (activeTool === "erase") {
      onModelChange(removeVoxel(modelRef.current, voxel));
      return;
    }

    if (activeTool === "paint") {
      onModelChange(setVoxelColor(modelRef.current, voxel, colorRef.current));
      return;
    }

    if (activeTool === "fill") {
      onModelChange(floodFillVoxels(modelRef.current, voxel, colorRef.current));
      return;
    }

    if (activeTool === "select") {
      const next = event.shiftKey ? new Set(selectedRef.current) : new Set<string>();
      const key = voxelKey(voxel);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      onSelectionChange(next);
      return;
    }

    if (activeTool === "add" && hit.face) {
      const normal = hit.face.normal.clone().round();
      onModelChange(
        addVoxelAt(
          modelRef.current,
          {
            x: voxel.x + normal.x,
            y: voxel.y + normal.y,
            z: voxel.z + normal.z
          },
          colorRef.current
        )
      );
    }
  }

  return (
    <div className="viewport-shell">
      <div className="viewport" ref={hostRef} />
      {model.voxels.length === 0 ? <div className="viewport-empty">No voxels</div> : null}
    </div>
  );
}
