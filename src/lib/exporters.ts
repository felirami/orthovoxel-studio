import * as THREE from "three";
import type { RenderOptions, VoxelModel } from "../types";

function addVoxelMesh(scene: THREE.Scene, model: VoxelModel) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const offsetX = (model.width - 1) / 2;
  const offsetY = (model.height - 1) / 2;
  const offsetZ = (model.depth - 1) / 2;
  const group = new THREE.Group();
  group.frustumCulled = false;
  const materials: THREE.MeshBasicMaterial[] = [];
  const byColor = new Map<string, VoxelModel["voxels"]>();

  model.voxels.forEach((voxel) => {
    const voxels = byColor.get(voxel.color) ?? [];
    voxels.push(voxel);
    byColor.set(voxel.color, voxels);
  });

  byColor.forEach((voxels, displayColor) => {
    const material = new THREE.MeshBasicMaterial({ color: displayColor });
    const mesh = new THREE.InstancedMesh(geometry, material, voxels.length);
    mesh.frustumCulled = false;

    voxels.forEach((voxel, index) => {
      matrix.makeTranslation(voxel.x - offsetX, voxel.y - offsetY, voxel.z - offsetZ);
      mesh.setMatrixAt(index, matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    materials.push(material);
  });

  scene.add(group);
  return { geometry, materials };
}

function setCamera(camera: THREE.OrthographicCamera, model: VoxelModel, angle: number, tilt: number, size: number) {
  const maxAxis = Math.max(model.width, model.height, model.depth, 1);
  const frustum = maxAxis * 1.85;
  const aspect = 1;
  camera.left = (-frustum * aspect) / 2;
  camera.right = (frustum * aspect) / 2;
  camera.top = frustum / 2;
  camera.bottom = -frustum / 2;
  camera.near = 0.1;
  camera.far = maxAxis * 8;
  camera.zoom = Math.max(0.25, Math.min(4, size / 512));

  const theta = THREE.MathUtils.degToRad(angle);
  const elevation = THREE.MathUtils.degToRad(tilt);
  const radius = maxAxis * 3;
  camera.position.set(
    Math.cos(theta) * Math.cos(elevation) * radius,
    Math.sin(elevation) * radius,
    Math.sin(theta) * Math.cos(elevation) * radius
  );
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

export async function renderModelToDataUrl(model: VoxelModel, options: RenderOptions): Promise<string> {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: options.transparent,
    antialias: false,
    preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(1);
  renderer.setSize(options.size, options.size, false);
  renderer.setClearColor(options.transparent ? 0x000000 : 0xf6f4ee, options.transparent ? 0 : 1);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
  keyLight.position.set(2, 5, 4);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xffefd0, 0.9);
  rimLight.position.set(-3, 2, -5);
  scene.add(rimLight);

  const resources = addVoxelMesh(scene, model);
  const camera = new THREE.OrthographicCamera();
  setCamera(camera, model, options.angle, options.tilt, options.size);
  renderer.render(scene, camera);

  const dataUrl = renderer.domElement.toDataURL("image/png");
  resources.geometry.dispose();
  resources.materials.forEach((material) => material.dispose());
  renderer.dispose();
  return dataUrl;
}

function loadPng(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load rendered frame")));
    image.src = dataUrl;
  });
}

export async function renderSpriteSheet(model: VoxelModel, directions: number, options: Omit<RenderOptions, "angle">) {
  const frames: HTMLImageElement[] = [];

  for (let index = 0; index < directions; index += 1) {
    const angle = (360 / directions) * index - 45;
    const dataUrl = await renderModelToDataUrl(model, { ...options, angle });
    frames.push(await loadPng(dataUrl));
  }

  const canvas = document.createElement("canvas");
  canvas.width = options.size * directions;
  canvas.height = options.size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Sprite sheet canvas is not available");
  }

  context.imageSmoothingEnabled = false;
  frames.forEach((frame, index) => {
    context.drawImage(frame, index * options.size, 0);
  });

  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function downloadText(text: string, filename: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
