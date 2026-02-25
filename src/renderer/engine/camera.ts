/**
 * Camera — Pan/zoom system for the map viewport.
 * 
 * Manages the transform from screen coordinates to global map coordinates.
 * Supports smooth zooming toward the cursor position.
 */

import { CameraState, Viewport, TileCoord } from '@shared/types';
import { TILE_SIZE, MIN_ZOOM, MAX_ZOOM } from '@shared/constants';

export class Camera {
  private state: CameraState;
  private canvasWidth: number = 0;
  private canvasHeight: number = 0;
  private mapWidth: number = 0;
  private mapHeight: number = 0;
  private tilesX: number = 0;
  private tilesY: number = 0;

  constructor() {
    this.state = { offsetX: 0, offsetY: 0, zoom: 1.0 };
  }

  /** Set the map dimensions (call after loading an image) */
  setMapSize(width: number, height: number): void {
    this.mapWidth = width;
    this.mapHeight = height;
    this.tilesX = Math.ceil(width / TILE_SIZE);
    this.tilesY = Math.ceil(height / TILE_SIZE);
  }

  /** Update canvas dimensions (call on resize) */
  setCanvasSize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
  }

  /** Pan by screen-space delta */
  pan(screenDx: number, screenDy: number): void {
    this.state.offsetX -= screenDx / this.state.zoom;
    this.state.offsetY -= screenDy / this.state.zoom;
  }

  /** Zoom toward a screen point */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.state.zoom * factor));

    // Adjust offset so the world point under the cursor stays fixed
    const worldX = this.state.offsetX + screenX / this.state.zoom;
    const worldY = this.state.offsetY + screenY / this.state.zoom;

    this.state.zoom = newZoom;

    this.state.offsetX = worldX - screenX / newZoom;
    this.state.offsetY = worldY - screenY / newZoom;
  }

  /** Convert screen coordinates to global map coordinates */
  screenToGlobal(screenX: number, screenY: number): { gx: number; gy: number } {
    return {
      gx: Math.floor(this.state.offsetX + screenX / this.state.zoom),
      gy: Math.floor(this.state.offsetY + screenY / this.state.zoom),
    };
  }

  /** Get the current viewport in global coordinates */
  getViewport(): Viewport {
    return {
      x: this.state.offsetX,
      y: this.state.offsetY,
      width: this.canvasWidth / this.state.zoom,
      height: this.canvasHeight / this.state.zoom,
    };
  }

  /** Get which tiles are visible in the current viewport */
  getVisibleTiles(): TileCoord[] {
    const vp = this.getViewport();
    const startTx = Math.max(0, Math.floor(vp.x / TILE_SIZE));
    const startTy = Math.max(0, Math.floor(vp.y / TILE_SIZE));
    const endTx = Math.min(this.tilesX - 1, Math.floor((vp.x + vp.width) / TILE_SIZE));
    const endTy = Math.min(this.tilesY - 1, Math.floor((vp.y + vp.height) / TILE_SIZE));

    const tiles: TileCoord[] = [];
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        tiles.push({ tx, ty });
      }
    }
    return tiles;
  }

  /** Get current camera state (for shader uniforms) */
  getState(): Readonly<CameraState> {
    return this.state;
  }

  /** Reset camera to show the full map */
  fitToMap(): void {
    this.state.offsetX = 0;
    this.state.offsetY = 0;
    this.state.zoom = Math.min(
      this.canvasWidth / this.mapWidth,
      this.canvasHeight / this.mapHeight
    );
  }
}
