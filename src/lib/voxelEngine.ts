import type { LoadedProjection, ProjectionSide, Voxel, VoxelModel } from "../types";

const ALPHA_THRESHOLD = 12;
const DEFAULT_AXIS = 32;

type ProjectionMap = Partial<Record<ProjectionSide, LoadedProjection>>;

interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

interface Sample {
  opaque: boolean;
  color: [number, number, number];
}

export function voxelKey(voxel: Pick<Voxel, "x" | "y" | "z">) {
  return `${voxel.x}:${voxel.y}:${voxel.z}`;
}

export function emptyModel(width = DEFAULT_AXIS, height = DEFAULT_AXIS, depth = DEFAULT_AXIS): VoxelModel {
  return {
    width,
    height,
    depth,
    voxels: [],
    sourceSides: [],
    updatedAt: new Date().toISOString()
  };
}

export function modelToMap(model: VoxelModel) {
  return new Map(model.voxels.map((voxel) => [voxelKey(voxel), voxel]));
}

function mapToModel(model: VoxelModel, map: Map<string, Voxel>): VoxelModel {
  return {
    ...model,
    voxels: Array.from(map.values()).sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x),
    updatedAt: new Date().toISOString()
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function inferRawDimensions(projections: ProjectionMap): Dimensions {
  const front = projections.front ?? projections.back;
  const side = projections.left ?? projections.right;
  const top = projections.top ?? projections.bottom;

  return {
    width: front?.width ?? top?.width ?? DEFAULT_AXIS,
    height: front?.height ?? side?.height ?? DEFAULT_AXIS,
    depth: side?.width ?? top?.height ?? DEFAULT_AXIS
  };
}

export function inferDimensions(projections: ProjectionMap, maxAxis: number): Dimensions {
  const raw = inferRawDimensions(projections);
  const largest = Math.max(raw.width, raw.height, raw.depth);
  const scale = largest > maxAxis ? maxAxis / largest : 1;

  return {
    width: Math.max(1, Math.round(raw.width * scale)),
    height: Math.max(1, Math.round(raw.height * scale)),
    depth: Math.max(1, Math.round(raw.depth * scale))
  };
}

function scaleCoord(position: number, sourceLength: number, targetLength: number) {
  if (sourceLength <= 1 || targetLength <= 1) {
    return 0;
  }

  return clamp(Math.round((position / (sourceLength - 1)) * (targetLength - 1)), 0, targetLength - 1);
}

function pixelAt(projection: LoadedProjection, x: number, y: number): Sample {
  const sx = clamp(x, 0, projection.width - 1);
  const sy = clamp(y, 0, projection.height - 1);
  const index = (sy * projection.width + sx) * 4;
  const { data } = projection.imageData;
  const alpha = data[index + 3];

  return {
    opaque: alpha > ALPHA_THRESHOLD,
    color: [data[index], data[index + 1], data[index + 2]]
  };
}

function sampleProjection(projection: LoadedProjection, dimensions: Dimensions, x: number, y: number, z: number): Sample {
  const flippedY = dimensions.height - 1 - y;

  switch (projection.side) {
    case "front":
      return pixelAt(
        projection,
        scaleCoord(x, dimensions.width, projection.width),
        scaleCoord(flippedY, dimensions.height, projection.height)
      );
    case "back":
      return pixelAt(
        projection,
        scaleCoord(dimensions.width - 1 - x, dimensions.width, projection.width),
        scaleCoord(flippedY, dimensions.height, projection.height)
      );
    case "left":
      return pixelAt(
        projection,
        scaleCoord(dimensions.depth - 1 - z, dimensions.depth, projection.width),
        scaleCoord(flippedY, dimensions.height, projection.height)
      );
    case "right":
      return pixelAt(
        projection,
        scaleCoord(z, dimensions.depth, projection.width),
        scaleCoord(flippedY, dimensions.height, projection.height)
      );
    case "top":
      return pixelAt(
        projection,
        scaleCoord(x, dimensions.width, projection.width),
        scaleCoord(z, dimensions.depth, projection.height)
      );
    case "bottom":
      return pixelAt(
        projection,
        scaleCoord(x, dimensions.width, projection.width),
        scaleCoord(dimensions.depth - 1 - z, dimensions.depth, projection.height)
      );
  }
}

function averageColor(samples: Sample[]) {
  const visible = samples.filter((sample) => sample.opaque);
  const total = visible.reduce(
    (sum, sample) => {
      sum[0] += sample.color[0];
      sum[1] += sample.color[1];
      sum[2] += sample.color[2];
      return sum;
    },
    [0, 0, 0]
  );

  const length = Math.max(1, visible.length);
  const r = Math.round(total[0] / length);
  const g = Math.round(total[1] / length);
  const b = Math.round(total[2] / length);
  return `#${[r, g, b].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

export function buildVoxelModel(projections: ProjectionMap, maxAxis: number): VoxelModel {
  const active = Object.values(projections).filter(Boolean) as LoadedProjection[];
  const dimensions = inferDimensions(projections, maxAxis);

  if (active.length === 0) {
    return emptyModel(dimensions.width, dimensions.height, dimensions.depth);
  }

  const voxels: Voxel[] = [];

  for (let y = 0; y < dimensions.height; y += 1) {
    for (let z = 0; z < dimensions.depth; z += 1) {
      for (let x = 0; x < dimensions.width; x += 1) {
        const samples = active.map((projection) => sampleProjection(projection, dimensions, x, y, z));

        if (samples.every((sample) => sample.opaque)) {
          voxels.push({ x, y, z, color: averageColor(samples) });
        }
      }
    }
  }

  return {
    ...dimensions,
    voxels,
    sourceSides: active.map((projection) => projection.side),
    updatedAt: new Date().toISOString()
  };
}

export function setVoxelColor(model: VoxelModel, voxel: Voxel, color: string): VoxelModel {
  const map = modelToMap(model);
  map.set(voxelKey(voxel), { ...voxel, color });
  return mapToModel(model, map);
}

export function removeVoxel(model: VoxelModel, voxel: Voxel): VoxelModel {
  const map = modelToMap(model);
  map.delete(voxelKey(voxel));
  return mapToModel(model, map);
}

export function deleteVoxels(model: VoxelModel, keys: Set<string>): VoxelModel {
  const map = modelToMap(model);
  keys.forEach((key) => map.delete(key));
  return mapToModel(model, map);
}

export function addVoxelAt(model: VoxelModel, position: Pick<Voxel, "x" | "y" | "z">, color: string): VoxelModel {
  if (
    position.x < 0 ||
    position.y < 0 ||
    position.z < 0 ||
    position.x >= model.width ||
    position.y >= model.height ||
    position.z >= model.depth
  ) {
    return model;
  }

  const map = modelToMap(model);
  map.set(voxelKey(position), { ...position, color });
  return mapToModel(model, map);
}

export function floodFillVoxels(model: VoxelModel, start: Voxel, color: string): VoxelModel {
  const map = modelToMap(model);
  const startKey = voxelKey(start);
  const original = map.get(startKey);

  if (!original || original.color.toLowerCase() === color.toLowerCase()) {
    return model;
  }

  const queue = [original];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const voxel = queue.shift();

    if (!voxel) {
      break;
    }

    const key = voxelKey(voxel);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const current = map.get(key);

    if (!current || current.color.toLowerCase() !== original.color.toLowerCase()) {
      continue;
    }

    map.set(key, { ...current, color });

    [
      { x: current.x + 1, y: current.y, z: current.z },
      { x: current.x - 1, y: current.y, z: current.z },
      { x: current.x, y: current.y + 1, z: current.z },
      { x: current.x, y: current.y - 1, z: current.z },
      { x: current.x, y: current.y, z: current.z + 1 },
      { x: current.x, y: current.y, z: current.z - 1 }
    ].forEach((neighbor) => {
      const neighborKey = voxelKey(neighbor);

      if (!seen.has(neighborKey)) {
        const next = map.get(neighborKey);

        if (next) {
          queue.push(next);
        }
      }
    });
  }

  return mapToModel(model, map);
}
