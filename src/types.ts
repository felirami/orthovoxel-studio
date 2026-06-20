export const PROJECTION_SIDES = ["front", "back", "left", "right", "top", "bottom"] as const;

export type ProjectionSide = (typeof PROJECTION_SIDES)[number];

export type ToolMode = "paint" | "add" | "erase" | "fill" | "select";

export interface LoadedProjection {
  side: ProjectionSide;
  name: string;
  width: number;
  height: number;
  dataUrl: string;
  imageData: ImageData;
}

export interface StoredProjection {
  side: ProjectionSide;
  name: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface Voxel {
  x: number;
  y: number;
  z: number;
  color: string;
}

export interface VoxelModel {
  width: number;
  height: number;
  depth: number;
  voxels: Voxel[];
  sourceSides: ProjectionSide[];
  updatedAt: string;
}

export interface ProjectFile {
  version: 1;
  name: string;
  savedAt: string;
  maxAxis: number;
  projections: StoredProjection[];
  model: VoxelModel;
}

export interface RenderOptions {
  angle: number;
  tilt: number;
  size: number;
  transparent: boolean;
}
