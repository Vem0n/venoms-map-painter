/**
 * Type definitions for the Voronoi-based province auto-generator.
 *
 * These types are used by the core algorithm (voronoi-generator.ts),
 * the overlay writer (voronoi-overlay.ts), and the UI component
 * (ProvinceGenerator.tsx).
 */

import type { RGB, ProvinceData } from '@shared/types';

/** Configuration for a Voronoi generation run */
export interface VoronoiConfig {
  /** The target RGB color of the province to subdivide */
  targetColor: RGB;
  /** Number of sub-provinces to generate (2–100) */
  count: number;
  /** Random seed for reproducibility (incrementing = "Regenerate") */
  seed?: number;
}

/** A connected component (segment) within the region */
export interface ComponentData {
  /** Pixel coordinates belonging to this segment */
  pixels: [number, number][];
  /** O(1) lookup set of "x,y" keys for this segment */
  pixelSet: Set<string>;
  /** Total pixel count in this segment */
  count: number;
}

/** Result of collecting all pixels belonging to a target color region */
export interface RegionData {
  /** All pixel coordinates as "x,y" strings for O(1) membership checks */
  pixelSet: Set<string>;
  /** Array of [x, y] pairs for random access / iteration */
  pixels: [number, number][];
  /** Axis-aligned bounding box in global coordinates */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Total pixel count */
  count: number;
  /** Connected components — segments separated by barriers (rivers, etc.) */
  components: ComponentData[];
}

/** A Voronoi seed point with its assigned sub-province index */
export interface VoronoiSeed {
  /** Global X coordinate */
  x: number;
  /** Global Y coordinate */
  y: number;
  /** Sub-province index (0 to actualRegionCount-1) */
  regionId: number;
}

/** Result of the full Voronoi assignment phase */
export interface VoronoiResult {
  /** Maps "x,y" pixel key → regionId (0..N-1) */
  assignment: Map<string, number>;
  /** The seed points used */
  seeds: VoronoiSeed[];
  /** "x,y" keys of boundary pixels (neighbor belongs to different region) */
  boundaryPixels: Set<string>;
  /** Actual region count produced (may be < requested if region too small) */
  actualRegionCount: number;
  /** Pixel count per region, indexed by regionId */
  regionSizes: number[];
}

/** State of the generator workflow — drives the UI state machine */
export type GeneratorPhase =
  | 'idle'        // No generation in progress
  | 'picking'     // Waiting for user to click a province on the map
  | 'collecting'  // Scanning pixels for the selected region
  | 'generating'  // Running Voronoi algorithm
  | 'previewing'  // Showing overlay preview, awaiting user action
  | 'applying';   // Writing pixels and registering provinces

/** Data passed from ProvinceGenerator to App.tsx on confirm */
export interface VoronoiConfirmData {
  /** Original province color that was subdivided */
  originalColor: RGB;
  /** Original province data (null if unregistered blob) */
  originalProvince: ProvinceData | null;
  /** The Voronoi assignment result */
  result: VoronoiResult;
  /** Region pixel data */
  region: RegionData;
}

/** Progress callback for async operations */
export type ProgressCallback = (phase: string, progress: number) => void;
