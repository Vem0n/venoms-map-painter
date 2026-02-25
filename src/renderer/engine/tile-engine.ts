/**
 * TileEngine — Core rendering system for the province map.
 *
 * Chunks a source PNG of any size into 512x512 tiles, uploads as WebGL2 textures,
 * and renders only visible tiles based on camera position. Provides global pixel
 * read/write abstraction across tile boundaries for paint tools.
 *
 * Usage:
 *   const engine = new TileEngine(canvas);
 *   engine.loadImage(rgbaBuffer, width, height);
 *   engine.startRenderLoop();
 */

import { RGB, TileCoord } from '@shared/types';
import { TILE_SIZE, BYTES_PER_PIXEL, MIN_ZOOM, MAX_ZOOM } from '@shared/constants';
import { createProgram, TILE_VERTEX_SHADER, TILE_FRAGMENT_SHADER } from './shaders';

export class TileEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  // Camera state
  private offsetX = 0;
  private offsetY = 0;
  private zoom = 1.0;

  // Map dimensions — set on loadImage(), vary per mod
  private mapWidth = 0;
  private mapHeight = 0;
  private tilesX = 0;
  private tilesY = 0;

  /** CPU-side pixel data per tile (indexed by tileIndex = ty * tilesX + tx) */
  private tileBuffers: Uint8ClampedArray[] = [];

  /** GPU texture handle per tile */
  private tileTextures: (WebGLTexture | null)[] = [];

  /** Tiles modified since last save */
  private dirtyTiles: Set<number> = new Set();

  /** Tiles needing GPU re-upload */
  private gpuDirtyTiles: Set<number> = new Set();

  /** Whether image data has been loaded */
  private loaded = false;

  /** Whether to draw tile grid borders */
  private showGrid = false;

  // WebGL resources
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private uniforms: {
    tilePosition: WebGLUniformLocation;
    tileSize: WebGLUniformLocation;
    cameraOffset: WebGLUniformLocation;
    zoom: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
    tileTexture: WebGLUniformLocation;
    showGrid: WebGLUniformLocation;
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    // Compile shader program
    this.program = createProgram(gl, TILE_VERTEX_SHADER, TILE_FRAGMENT_SHADER);

    // Cache uniform locations
    const getUniform = (name: string): WebGLUniformLocation => {
      const loc = gl.getUniformLocation(this.program, name);
      if (loc === null) throw new Error(`Uniform '${name}' not found`);
      return loc;
    };
    this.uniforms = {
      tilePosition: getUniform('u_tilePosition'),
      tileSize: getUniform('u_tileSize'),
      cameraOffset: getUniform('u_cameraOffset'),
      zoom: getUniform('u_zoom'),
      resolution: getUniform('u_resolution'),
      tileTexture: getUniform('u_tileTexture'),
      showGrid: getUniform('u_showGrid'),
    };

    // Create a unit-quad VAO (two triangles covering [0,0]-[1,1])
    this.vao = this.createQuadVAO(gl);
  }

  /** Build a VAO with a unit quad (0,0)-(1,1) as two triangles */
  private createQuadVAO(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('Failed to create VAO');
    gl.bindVertexArray(vao);

    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    // Two triangles: (0,0),(1,0),(0,1) and (0,1),(1,0),(1,1)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 1, 1, 0, 1, 1,
    ]), gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return vao;
  }

  /**
   * Release all tile buffers and GPU textures.
   * Call before loading a new map to free the old one's memory.
   */
  private releaseMapData(): void {
    const gl = this.gl;

    // Delete GPU textures
    for (const tex of this.tileTextures) {
      if (tex) gl.deleteTexture(tex);
    }
    this.tileTextures.length = 0;

    // Release CPU tile buffers
    this.tileBuffers.length = 0;

    this.dirtyTiles.clear();
    this.gpuDirtyTiles.clear();
    this.loaded = false;
  }

  loadImage(rgbaBuffer: Uint8Array | Uint8ClampedArray, width: number, height: number): void {
    const expectedSize = width * height * BYTES_PER_PIXEL;
    if (rgbaBuffer.length !== expectedSize) {
      throw new Error(
        `Buffer size ${rgbaBuffer.length} does not match expected ${expectedSize} for ${width}x${height}`
      );
    }

    const gl = this.gl;

    // Release previous map data before allocating new
    this.releaseMapData();

    // Set map dimensions — tiles round up to cover edge pixels
    this.mapWidth = width;
    this.mapHeight = height;
    this.tilesX = Math.ceil(width / TILE_SIZE);
    this.tilesY = Math.ceil(height / TILE_SIZE);

    for (let ty = 0; ty < this.tilesY; ty++) {
      for (let tx = 0; tx < this.tilesX; tx++) {
        const tileIndex = ty * this.tilesX + tx;
        const tileBuffer = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL);

        // Copy the tile region row-by-row from the source buffer
        const srcX = tx * TILE_SIZE;
        const srcY = ty * TILE_SIZE;
        // Handle edge tiles that extend beyond the image
        const copyW = Math.min(TILE_SIZE, width - srcX);
        const copyH = Math.min(TILE_SIZE, height - srcY);

        for (let row = 0; row < copyH; row++) {
          const srcOffset = ((srcY + row) * width + srcX) * BYTES_PER_PIXEL;
          const dstOffset = row * TILE_SIZE * BYTES_PER_PIXEL;
          tileBuffer.set(
            rgbaBuffer.subarray(srcOffset, srcOffset + copyW * BYTES_PER_PIXEL),
            dstOffset
          );
        }

        this.tileBuffers[tileIndex] = tileBuffer;
        this.tileTextures[tileIndex] = this.createTileTexture(gl, tileBuffer);
      }
    }

    this.loaded = true;
    this.fitToCanvas();
  }

  /** Create a WebGL texture from tile RGBA data */
  private createTileTexture(gl: WebGL2RenderingContext, data: Uint8ClampedArray): WebGLTexture {
    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create texture');

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      TILE_SIZE, TILE_SIZE, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, data
    );
    // Nearest-neighbor for pixel-exact rendering
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return tex;
  }

  /**
   * Read a pixel at global coordinates.
   * Resolves to the correct tile internally.
   */
  getPixel(gx: number, gy: number): RGB {
    if (gx < 0 || gx >= this.mapWidth || gy < 0 || gy >= this.mapHeight) {
      return { r: 0, g: 0, b: 0 };
    }
    const tx = Math.floor(gx / TILE_SIZE);
    const ty = Math.floor(gy / TILE_SIZE);
    const lx = gx % TILE_SIZE;
    const ly = gy % TILE_SIZE;
    const tileIndex = ty * this.tilesX + tx;
    const buf = this.tileBuffers[tileIndex];
    const offset = (ly * TILE_SIZE + lx) * BYTES_PER_PIXEL;
    return { r: buf[offset], g: buf[offset + 1], b: buf[offset + 2] };
  }

  /**
   * Write a pixel at global coordinates.
   * Marks the tile as dirty for both save tracking and GPU re-upload.
   */
  setPixel(gx: number, gy: number, color: RGB): void {
    if (gx < 0 || gx >= this.mapWidth || gy < 0 || gy >= this.mapHeight) return;
    const tx = Math.floor(gx / TILE_SIZE);
    const ty = Math.floor(gy / TILE_SIZE);
    const lx = gx % TILE_SIZE;
    const ly = gy % TILE_SIZE;
    const tileIndex = ty * this.tilesX + tx;
    const buf = this.tileBuffers[tileIndex];
    const offset = (ly * TILE_SIZE + lx) * BYTES_PER_PIXEL;
    buf[offset] = color.r;
    buf[offset + 1] = color.g;
    buf[offset + 2] = color.b;
    buf[offset + 3] = 255;
    this.dirtyTiles.add(tileIndex);
    this.gpuDirtyTiles.add(tileIndex);
  }

  /** Get a snapshot of a tile's pixel data (for undo/redo) */
  snapshotTile(tileIndex: number): Uint8ClampedArray {
    return new Uint8ClampedArray(this.tileBuffers[tileIndex]);
  }

  /** Restore a tile from a snapshot (for undo/redo) */
  restoreTile(tileIndex: number, snapshot: Uint8ClampedArray): void {
    this.tileBuffers[tileIndex].set(snapshot);
    this.gpuDirtyTiles.add(tileIndex);
  }

  /** Compute which tiles are visible in the current viewport */
  private getVisibleTiles(): TileCoord[] {
    const vpWidth = this.canvas.width / this.zoom;
    const vpHeight = this.canvas.height / this.zoom;

    const startTx = Math.max(0, Math.floor(this.offsetX / TILE_SIZE));
    const startTy = Math.max(0, Math.floor(this.offsetY / TILE_SIZE));
    const endTx = Math.min(this.tilesX - 1, Math.floor((this.offsetX + vpWidth) / TILE_SIZE));
    const endTy = Math.min(this.tilesY - 1, Math.floor((this.offsetY + vpHeight) / TILE_SIZE));

    const tiles: TileCoord[] = [];
    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        tiles.push({ tx, ty });
      }
    }
    return tiles;
  }

  /** Main render call — draws visible tiles to the canvas */
  render(): void {
    if (!this.loaded) return;

    const gl = this.gl;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    // Re-upload GPU-dirty tiles
    for (const tileIndex of this.gpuDirtyTiles) {
      const tex = this.tileTextures[tileIndex];
      if (!tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0, 0, 0,
        TILE_SIZE, TILE_SIZE,
        gl.RGBA, gl.UNSIGNED_BYTE,
        this.tileBuffers[tileIndex]
      );
    }
    this.gpuDirtyTiles.clear();

    // Set up viewport and clear
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0.04, 0.04, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // Set per-frame uniforms
    gl.uniform2f(this.uniforms.cameraOffset, this.offsetX, this.offsetY);
    gl.uniform1f(this.uniforms.zoom, this.zoom);
    gl.uniform2f(this.uniforms.resolution, cw, ch);
    gl.uniform2f(this.uniforms.tileSize, TILE_SIZE, TILE_SIZE);
    gl.uniform1i(this.uniforms.showGrid, this.showGrid ? 1 : 0);

    // Draw visible tiles
    const visibleTiles = this.getVisibleTiles();
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uniforms.tileTexture, 0);

    for (const { tx, ty } of visibleTiles) {
      const tileIndex = ty * this.tilesX + tx;
      const tex = this.tileTextures[tileIndex];
      if (!tex) continue;

      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform2f(this.uniforms.tilePosition, tx * TILE_SIZE, ty * TILE_SIZE);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    gl.bindVertexArray(null);
  }

  /** Start the render loop */
  startRenderLoop(): void {
    const loop = (): void => {
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Pan the camera by screen-space delta */
  pan(screenDx: number, screenDy: number): void {
    this.offsetX -= screenDx / this.zoom;
    this.offsetY -= screenDy / this.zoom;
  }

  /** Zoom toward a screen point (cursor-preserving zoom) */
  zoomAt(factor: number, screenX: number, screenY: number): void {
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * factor));

    // Keep the world point under cursor fixed
    const worldX = this.offsetX + screenX / this.zoom;
    const worldY = this.offsetY + screenY / this.zoom;

    this.zoom = newZoom;

    this.offsetX = worldX - screenX / newZoom;
    this.offsetY = worldY - screenY / newZoom;
  }

  /** Convert screen coordinates to global map coordinates */
  screenToGlobal(screenX: number, screenY: number): { gx: number; gy: number } {
    return {
      gx: Math.floor(this.offsetX + screenX / this.zoom),
      gy: Math.floor(this.offsetY + screenY / this.zoom),
    };
  }

  /** Resize the canvas to match its CSS container */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** Fit the entire map into the current canvas */
  fitToCanvas(): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    if (cw === 0 || ch === 0) return;

    this.zoom = Math.min(cw / this.mapWidth, ch / this.mapHeight);
    // Center the map
    this.offsetX = -(cw / this.zoom - this.mapWidth) / 2;
    this.offsetY = -(ch / this.zoom - this.mapHeight) / 2;
  }

  /** Toggle tile grid border visibility */
  toggleGrid(): void {
    this.showGrid = !this.showGrid;
  }

  /** Whether grid is currently shown */
  getShowGrid(): boolean {
    return this.showGrid;
  }

  /** Get current zoom level */
  getZoom(): number {
    return this.zoom;
  }

  /** Get loaded map dimensions */
  getMapSize(): { width: number; height: number } {
    return { width: this.mapWidth, height: this.mapHeight };
  }

  /** Whether image has been loaded */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Get all dirty tile indices (for save) */
  getDirtyTiles(): Set<number> {
    return new Set(this.dirtyTiles);
  }

  /** Clear dirty flags (after save) */
  clearDirtyFlags(): void {
    this.dirtyTiles.clear();
  }

  /** Check if any tiles have been modified since last save */
  isDirty(): boolean {
    return this.dirtyTiles.size > 0;
  }

  /**
   * Center the viewport on a global coordinate at the specified zoom level.
   * Used by province search to jump to a province's location.
   */
  centerOn(gx: number, gy: number, targetZoom?: number): void {
    if (targetZoom !== undefined) {
      this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, targetZoom));
    }
    this.offsetX = gx - (this.canvas.width / this.zoom) / 2;
    this.offsetY = gy - (this.canvas.height / this.zoom) / 2;
  }

  /**
   * Find the approximate centroid of all pixels matching a given color.
   * Processes tiles in chunked batches, yielding to the event loop between
   * chunks to avoid UI freeze on large maps.
   *
   * @returns Promise resolving to centroid {gx, gy} or null if not found
   */
  findColorLocationAsync(color: RGB): Promise<{ gx: number; gy: number } | null> {
    if (!this.loaded) return Promise.resolve(null);

    const totalTiles = this.tilesX * this.tilesY;
    const stride = 4;
    const chunkSize = 16;
    let tileIdx = 0;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    return new Promise((resolve) => {
      const processChunk = (): void => {
        const end = Math.min(tileIdx + chunkSize, totalTiles);
        for (; tileIdx < end; tileIdx++) {
          const tx = tileIdx % this.tilesX;
          const ty = Math.floor(tileIdx / this.tilesX);
          const buf = this.tileBuffers[tileIdx];
          const tileBaseX = tx * TILE_SIZE;
          const tileBaseY = ty * TILE_SIZE;

          const validW = Math.min(TILE_SIZE, this.mapWidth - tileBaseX);
          const validH = Math.min(TILE_SIZE, this.mapHeight - tileBaseY);

          for (let ly = 0; ly < validH; ly += stride) {
            for (let lx = 0; lx < validW; lx += stride) {
              const offset = (ly * TILE_SIZE + lx) * BYTES_PER_PIXEL;
              if (buf[offset] === color.r && buf[offset + 1] === color.g && buf[offset + 2] === color.b) {
                sumX += tileBaseX + lx;
                sumY += tileBaseY + ly;
                count++;
              }
            }
          }
        }

        if (tileIdx < totalTiles) {
          setTimeout(processChunk, 0);
        } else {
          if (count === 0) {
            resolve(null);
          } else {
            resolve({ gx: Math.round(sumX / count), gy: Math.round(sumY / count) });
          }
        }
      };

      processChunk();
    });
  }

  /**
   * Stitch all tiles back into a full RGBA buffer for saving.
   * Only call on save — allocates a large buffer.
   */
  stitchFullImage(): Uint8ClampedArray {
    const fullBuffer = new Uint8ClampedArray(this.mapWidth * this.mapHeight * BYTES_PER_PIXEL);
    for (let ty = 0; ty < this.tilesY; ty++) {
      for (let tx = 0; tx < this.tilesX; tx++) {
        const tileIndex = ty * this.tilesX + tx;
        const tileBuf = this.tileBuffers[tileIndex];
        const dstX = tx * TILE_SIZE;
        const dstY = ty * TILE_SIZE;
        const copyW = Math.min(TILE_SIZE, this.mapWidth - dstX);
        const copyH = Math.min(TILE_SIZE, this.mapHeight - dstY);
        for (let row = 0; row < copyH; row++) {
          const srcOffset = row * TILE_SIZE * BYTES_PER_PIXEL;
          const dstOffset = ((dstY + row) * this.mapWidth + dstX) * BYTES_PER_PIXEL;
          fullBuffer.set(
            tileBuf.subarray(srcOffset, srcOffset + copyW * BYTES_PER_PIXEL),
            dstOffset
          );
        }
      }
    }
    return fullBuffer;
  }
}
