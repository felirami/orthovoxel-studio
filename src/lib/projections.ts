import type { LoadedProjection, ProjectionSide, StoredProjection } from "../types";

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Could not load image")));
    image.src = dataUrl;
  });
}

export async function decodeProjection(side: ProjectionSide, name: string, dataUrl: string): Promise<LoadedProjection> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas image decoding is not available");
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  return {
    side,
    name,
    width: canvas.width,
    height: canvas.height,
    dataUrl,
    imageData: context.getImageData(0, 0, canvas.width, canvas.height)
  };
}

export async function loadProjectionFromFile(side: ProjectionSide, file: File): Promise<LoadedProjection> {
  const dataUrl = await readFileAsDataUrl(file);
  return decodeProjection(side, file.name, dataUrl);
}

export function stripProjection(projection: LoadedProjection): StoredProjection {
  return {
    side: projection.side,
    name: projection.name,
    width: projection.width,
    height: projection.height,
    dataUrl: projection.dataUrl
  };
}

export async function hydrateProjection(projection: StoredProjection): Promise<LoadedProjection> {
  return decodeProjection(projection.side, projection.name, projection.dataUrl);
}

function pixelRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string) {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas drawing is not available");
  }

  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  return { canvas, context };
}

export async function createDemoProjections(): Promise<LoadedProjection[]> {
  const size = 32;
  const front = makeCanvas(size, size);
  const side = makeCanvas(size, size);
  const top = makeCanvas(size, size);

  pixelRect(front.context, 8, 12, 16, 14, "#d65a31");
  pixelRect(front.context, 10, 8, 12, 5, "#f0c75e");
  pixelRect(front.context, 12, 16, 4, 4, "#3f8fb5");
  pixelRect(front.context, 18, 16, 3, 7, "#2c4b57");
  pixelRect(front.context, 7, 25, 18, 2, "#6e352c");

  pixelRect(side.context, 9, 12, 14, 14, "#b94733");
  pixelRect(side.context, 11, 8, 10, 5, "#e1b953");
  pixelRect(side.context, 13, 15, 5, 5, "#357ca2");
  pixelRect(side.context, 8, 25, 16, 2, "#59302c");

  pixelRect(top.context, 8, 9, 16, 14, "#d65a31");
  pixelRect(top.context, 10, 7, 12, 4, "#f0c75e");
  pixelRect(top.context, 11, 12, 6, 4, "#3f8fb5");
  pixelRect(top.context, 19, 14, 4, 7, "#2c4b57");

  return Promise.all([
    decodeProjection("front", "demo-front.png", front.canvas.toDataURL("image/png")),
    decodeProjection("right", "demo-right.png", side.canvas.toDataURL("image/png")),
    decodeProjection("top", "demo-top.png", top.canvas.toDataURL("image/png"))
  ]);
}
