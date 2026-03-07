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

import { RGB, TileCoord, rgbToKey } from '@shared/types';
import { TILE_SIZE, BYTES_PER_PIXEL, MIN_ZOOM, MAX_ZOOM } from '@shared/constants';
import { createProgram, TILE_VERTEX_SHADER, TILE_FRAGMENT_SHADER, PASTE_VERTEX_SHADER, PASTE_FRAGMENT_SHADER } from './shaders';

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

  /** Overlay system — per-tile RGBA buffers and GPU textures for preview rendering */
  private overlayBuffers: (Uint8ClampedArray | null)[] = [];
  private overlayTextures: (WebGLTexture | null)[] = [];
  private overlayGpuDirty: Set<number> = new Set();
  private showOverlay = false;

  /** Heightmap overlay — separate per-tile GPU textures, blended via shader */
  private heightmapTextures: (WebGLTexture | null)[] = [];
  private showHeightmap = false;
  private heightmapOpacity = 0.5;
  private heightmapLoaded = false;

  /** Paste preview overlay — single texture rendered as a world-space quad */
  private pastePreviewTexture: WebGLTexture | null = null;
  private pastePreviewX = 0;
  private pastePreviewY = 0;
  private pastePreviewW = 0;
  private pastePreviewH = 0;
  private showPastePreview = false;

  // WebGL resources
  private program: WebGLProgram;
  private pasteProgram: WebGLProgram;
  private pasteUniforms!: {
    pastePosition: WebGLUniformLocation;
    pasteSize: WebGLUniformLocation;
    cameraOffset: WebGLUniformLocation;
    zoom: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
    pasteTexture: WebGLUniformLocation;
  };
  private vao: WebGLVertexArrayObject;
  private uniforms: {
    tilePosition: WebGLUniformLocation;
    tileSize: WebGLUniformLocation;
    cameraOffset: WebGLUniformLocation;
    zoom: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
    tileTexture: WebGLUniformLocation;
    showGrid: WebGLUniformLocation;
    overlayTexture: WebGLUniformLocation;
    showOverlay: WebGLUniformLocation;
    heightmapTexture: WebGLUniformLocation;
    showHeightmap: WebGLUniformLocation;
    heightmapOpacity: WebGLUniformLocation;
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
      overlayTexture: getUniform('u_overlayTexture'),
      showOverlay: getUniform('u_showOverlay'),
      heightmapTexture: getUniform('u_heightmapTexture'),
      showHeightmap: getUniform('u_showHeightmap'),
      heightmapOpacity: getUniform('u_heightmapOpacity'),
    };

    // Compile paste preview shader program
    this.pasteProgram = createProgram(gl, PASTE_VERTEX_SHADER, PASTE_FRAGMENT_SHADER);
    const getPasteUniform = (name: string): WebGLUniformLocation => {
      const loc = gl.getUniformLocation(this.pasteProgram, name);
      if (loc === null) throw new Error(`Paste uniform '${name}' not found`);
      return loc;
    };
    this.pasteUniforms = {
      pastePosition: getPasteUniform('u_pastePosition'),
      pasteSize: getPasteUniform('u_pasteSize'),
      cameraOffset: getPasteUniform('u_cameraOffset'),
      zoom: getPasteUniform('u_zoom'),
      resolution: getPasteUniform('u_resolution'),
      pasteTexture: getPasteUniform('u_pasteTexture'),
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

    // Release overlay resources
    for (const tex of this.overlayTextures) {
      if (tex) gl.deleteTexture(tex);
    }
    this.overlayTextures.length = 0;
    this.overlayBuffers.length = 0;
    this.overlayGpuDirty.clear();
    this.showOverlay = false;

    // Release heightmap resources
    for (const tex of this.heightmapTextures) {
      if (tex) gl.deleteTexture(tex);
    }
    this.heightmapTextures.length = 0;
    this.showHeightmap = false;
    this.heightmapLoaded = false;

    // Release paste preview
    if (this.pastePreviewTexture) {
      gl.deleteTexture(this.pastePreviewTexture);
      this.pastePreviewTexture = null;
    }
    this.showPastePreview = false;

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

  /* ── Overlay System ────────────────────────────────────────── */

  /**
   * Set an overlay pixel at global coordinates.
   * Lazily creates the overlay buffer and GPU texture for the tile.
   */
  setOverlayPixel(gx: number, gy: number, r: number, g: number, b: number, a: number): void {
    if (gx < 0 || gx >= this.mapWidth || gy < 0 || gy >= this.mapHeight) return;
    const tx = Math.floor(gx / TILE_SIZE);
    const ty = Math.floor(gy / TILE_SIZE);
    const lx = gx % TILE_SIZE;
    const ly = gy % TILE_SIZE;
    const tileIndex = ty * this.tilesX + tx;

    // Lazy-create overlay buffer for this tile
    if (!this.overlayBuffers[tileIndex]) {
      this.overlayBuffers[tileIndex] = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL);
    }

    const buf = this.overlayBuffers[tileIndex]!;
    const offset = (ly * TILE_SIZE + lx) * BYTES_PER_PIXEL;
    buf[offset] = r;
    buf[offset + 1] = g;
    buf[offset + 2] = b;
    buf[offset + 3] = a;
    this.overlayGpuDirty.add(tileIndex);
  }

  /** Clear all overlay data and GPU textures. */
  clearOverlay(): void {
    const gl = this.gl;
    for (const tex of this.overlayTextures) {
      if (tex) gl.deleteTexture(tex);
    }
    this.overlayTextures.length = 0;
    this.overlayBuffers.length = 0;
    this.overlayGpuDirty.clear();
    this.showOverlay = false;
  }

  /** Toggle overlay visibility. */
  setOverlayVisible(visible: boolean): void {
    this.showOverlay = visible;
  }

  /** Check if overlay is currently visible. */
  isOverlayVisible(): boolean {
    return this.showOverlay;
  }

  /* ── Heightmap Overlay ──────────────────────────────────────── */

  /**
   * Load a heightmap RGBA buffer and chunk it into per-tile GPU textures.
   * The heightmap must be the same resolution as the loaded map.
   * Does not modify the original file — purely a read-only visual overlay.
   */
  loadHeightmap(rgbaBuffer: Uint8Array | Uint8ClampedArray, width: number, height: number): void {
    if (!this.loaded) return;
    if (width !== this.mapWidth || height !== this.mapHeight) {
      console.warn(`Heightmap size ${width}x${height} doesn't match map ${this.mapWidth}x${this.mapHeight}, skipping`);
      return;
    }

    const gl = this.gl;

    // Release previous heightmap textures
    for (const tex of this.heightmapTextures) {
      if (tex) gl.deleteTexture(tex);
    }
    this.heightmapTextures.length = 0;

    // Chunk into per-tile textures (same layout as main tiles)
    for (let ty = 0; ty < this.tilesY; ty++) {
      for (let tx = 0; tx < this.tilesX; tx++) {
        const tileIndex = ty * this.tilesX + tx;
        const tileBuffer = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL);

        const srcX = tx * TILE_SIZE;
        const srcY = ty * TILE_SIZE;
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

        this.heightmapTextures[tileIndex] = this.createTileTexture(gl, tileBuffer);
      }
    }

    this.heightmapLoaded = true;
  }

  /** Toggle heightmap overlay visibility. */
  setHeightmapVisible(visible: boolean): void {
    this.showHeightmap = visible;
  }

  /** Check if heightmap overlay is currently visible. */
  isHeightmapVisible(): boolean {
    return this.showHeightmap;
  }

  /** Set heightmap overlay opacity (0.0 to 1.0). */
  setHeightmapOpacity(opacity: number): void {
    this.heightmapOpacity = Math.max(0, Math.min(1, opacity));
  }

  /** Get current heightmap overlay opacity. */
  getHeightmapOpacity(): number {
    return this.heightmapOpacity;
  }

  /** Whether a heightmap has been loaded. */
  isHeightmapLoaded(): boolean {
    return this.heightmapLoaded;
  }

  /* ── Paste Preview ──────────────────────────────────────── */

  /**
   * Set the paste preview data and make it visible.
   * Creates a GPU texture from the RGBA pixel buffer.
   * Masked-out pixels should have alpha=0 in the buffer.
   */
  setPastePreview(pixels: Uint8ClampedArray, width: number, height: number, worldX: number, worldY: number): void {
    const gl = this.gl;

    // Clean up previous
    if (this.pastePreviewTexture) {
      gl.deleteTexture(this.pastePreviewTexture);
    }

    const tex = gl.createTexture();
    if (!tex) return;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.pastePreviewTexture = tex;
    this.pastePreviewX = worldX;
    this.pastePreviewY = worldY;
    this.pastePreviewW = width;
    this.pastePreviewH = height;
    this.showPastePreview = true;
  }

  /** Update the paste preview world position (for dragging). */
  updatePastePreviewPosition(worldX: number, worldY: number): void {
    this.pastePreviewX = worldX;
    this.pastePreviewY = worldY;
  }

  /** Get current paste preview position and size. */
  getPastePreviewBounds(): { x: number; y: number; w: number; h: number } | null {
    if (!this.showPastePreview) return null;
    return { x: this.pastePreviewX, y: this.pastePreviewY, w: this.pastePreviewW, h: this.pastePreviewH };
  }

  /** Remove the paste preview and free GPU resources. */
  clearPastePreview(): void {
    if (this.pastePreviewTexture) {
      this.gl.deleteTexture(this.pastePreviewTexture);
      this.pastePreviewTexture = null;
    }
    this.showPastePreview = false;
  }

  /** Whether paste preview is currently visible. */
  isPastePreviewVisible(): boolean {
    return this.showPastePreview;
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

    // Re-upload GPU-dirty main tiles
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

    // Re-upload GPU-dirty overlay tiles
    for (const tileIndex of this.overlayGpuDirty) {
      const buf = this.overlayBuffers[tileIndex];
      if (!buf) continue;
      if (!this.overlayTextures[tileIndex]) {
        this.overlayTextures[tileIndex] = this.createTileTexture(gl, buf);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.overlayTextures[tileIndex]!);
        gl.texSubImage2D(
          gl.TEXTURE_2D, 0, 0, 0,
          TILE_SIZE, TILE_SIZE,
          gl.RGBA, gl.UNSIGNED_BYTE, buf
        );
      }
    }
    this.overlayGpuDirty.clear();

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

      // Bind overlay texture if available for this tile
      const overlayTex = this.showOverlay ? this.overlayTextures[tileIndex] : null;
      if (overlayTex) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, overlayTex);
        gl.uniform1i(this.uniforms.overlayTexture, 1);
        gl.uniform1i(this.uniforms.showOverlay, 1);
        gl.activeTexture(gl.TEXTURE0);
      } else {
        gl.uniform1i(this.uniforms.showOverlay, 0);
      }

      // Bind heightmap texture if available for this tile
      const hmTex = this.showHeightmap ? this.heightmapTextures[tileIndex] : null;
      if (hmTex) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, hmTex);
        gl.uniform1i(this.uniforms.heightmapTexture, 2);
        gl.uniform1i(this.uniforms.showHeightmap, 1);
        gl.uniform1f(this.uniforms.heightmapOpacity, this.heightmapOpacity);
        gl.activeTexture(gl.TEXTURE0);
      } else {
        gl.uniform1i(this.uniforms.showHeightmap, 0);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // Draw paste preview quad (after all tiles, on top)
    if (this.showPastePreview && this.pastePreviewTexture) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.pasteProgram);
      // VAO is still bound with the same quad geometry

      gl.uniform2f(this.pasteUniforms.pastePosition, this.pastePreviewX, this.pastePreviewY);
      gl.uniform2f(this.pasteUniforms.pasteSize, this.pastePreviewW, this.pastePreviewH);
      gl.uniform2f(this.pasteUniforms.cameraOffset, this.offsetX, this.offsetY);
      gl.uniform1f(this.pasteUniforms.zoom, this.zoom);
      gl.uniform2f(this.pasteUniforms.resolution, cw, ch);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.pastePreviewTexture);
      gl.uniform1i(this.pasteUniforms.pasteTexture, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      gl.disable(gl.BLEND);
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

  /** Get current camera state (offset + zoom) for coordinate conversion */
  getCamera(): { offsetX: number; offsetY: number; zoom: number } {
    return { offsetX: this.offsetX, offsetY: this.offsetY, zoom: this.zoom };
  }

  /** Get loaded map dimensions */
  getMapSize(): { width: number; height: number } {
    return { width: this.mapWidth, height: this.mapHeight };
  }

  /** Whether image has been loaded */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Get the underlying canvas element */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get a read-only reference to a tile's pixel buffer.
   * For use by spatial indexes that need to scan pixel data without WebGL.
   */
  getTileBuffer(tileIndex: number): Uint8ClampedArray | null {
    if (tileIndex < 0 || tileIndex >= this.tileBuffers.length) return null;
    return this.tileBuffers[tileIndex];
  }

  /** Get the tile grid dimensions */
  getTileGridSize(): { tilesX: number; tilesY: number } {
    return { tilesX: this.tilesX, tilesY: this.tilesY };
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
   * Collect all unique RGB colors present on the map.
   * Iterates every pixel in chunked batches, yielding to the event loop
   * between chunks to avoid UI freeze on large maps.
   *
   * @param skipColors - Set of rgbToKey strings to exclude (empty/unassigned colors)
   * @returns Promise resolving to Set of rgbToKey strings for all colors found
   */
  collectUsedColorsAsync(skipColors: Set<string>): Promise<Set<string>> {
    if (!this.loaded) return Promise.resolve(new Set());

    const totalTiles = this.tilesX * this.tilesY;
    const chunkSize = 4; // fewer tiles per chunk since stride=1
    let tileIdx = 0;
    const result = new Set<string>();

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

          for (let ly = 0; ly < validH; ly++) {
            for (let lx = 0; lx < validW; lx++) {
              const offset = (ly * TILE_SIZE + lx) * BYTES_PER_PIXEL;
              const key = rgbToKey({ r: buf[offset], g: buf[offset + 1], b: buf[offset + 2] });
              if (!skipColors.has(key)) {
                result.add(key);
              }
            }
          }
        }

        if (tileIdx < totalTiles) {
          setTimeout(processChunk, 0);
        } else {
          resolve(result);
        }
      };

      processChunk();
    });
  }

  /**
   * Scan tiles for pixels matching selectedColors and write selection
   * overlay (tint + border) directly using raw buffer access.
   *
   * Avoids per-pixel getPixel()/setOverlayPixel() overhead by accessing
   * tileBuffers[] directly and using packed 24-bit integer color comparison
   * instead of string allocation. Follows the same chunked pattern as
   * collectUsedColorsAsync().
   *
   * @param selectedColors - Set of rgbToKey strings for selected province colors
   * @param fillRGBA - [r, g, b, a] interior tint color
   * @param borderRGBA - [r, g, b, a] border pixel color
   * @param tileSubset - Optional set of tile indices to scan. When provided, only
   *   these tiles are processed instead of the full map. Use with SectorManager to
   *   restrict scanning to tiles that actually contain the selected colors.
   */
  scanTilesForOverlay(
    selectedColors: Set<string>,
    fillRGBA: [number, number, number, number],
    borderRGBA: [number, number, number, number],
    tileSubset?: ReadonlySet<number>,
  ): Promise<void> {
    if (!this.loaded || selectedColors.size === 0) return Promise.resolve();

    // Convert string keys to packed 24-bit integers for fast numeric lookup
    const numericColors = new Set<number>();
    for (const key of selectedColors) {
      const parts = key.split(',');
      numericColors.add(
        (parseInt(parts[0], 10) << 16) |
        (parseInt(parts[1], 10) << 8) |
        parseInt(parts[2], 10)
      );
    }

    // Build ordered list of tiles to process
    const tileIndices: number[] = tileSubset
      ? Array.from(tileSubset).sort((a, b) => a - b)
      : Array.from({ length: this.tilesX * this.tilesY }, (_, i) => i);
    const totalTiles = tileIndices.length;
    const chunkSize = 4;
    let cursor = 0;
    const rowStride = TILE_SIZE * BYTES_PER_PIXEL;

    const [fillR, fillG, fillB, fillA] = fillRGBA;
    const [borderR, borderG, borderB, borderA] = borderRGBA;

    this.clearOverlay();

    return new Promise((resolve) => {
      const processChunk = (): void => {
        const end = Math.min(cursor + chunkSize, totalTiles);

        for (; cursor < end; cursor++) {
          const tileIdx = tileIndices[cursor];
          const tx = tileIdx % this.tilesX;
          const ty = Math.floor(tileIdx / this.tilesX);
          const buf = this.tileBuffers[tileIdx];

          const tileBaseX = tx * TILE_SIZE;
          const tileBaseY = ty * TILE_SIZE;
          const validW = Math.min(TILE_SIZE, this.mapWidth - tileBaseX);
          const validH = Math.min(TILE_SIZE, this.mapHeight - tileBaseY);

          // Precompute neighbor tile buffers for cross-tile border detection
          const leftBuf = tx > 0
            ? this.tileBuffers[ty * this.tilesX + (tx - 1)] : null;
          const rightBuf = tx < this.tilesX - 1
            ? this.tileBuffers[ty * this.tilesX + (tx + 1)] : null;
          const upBuf = ty > 0
            ? this.tileBuffers[(ty - 1) * this.tilesX + tx] : null;
          const downBuf = ty < this.tilesY - 1
            ? this.tileBuffers[(ty + 1) * this.tilesX + tx] : null;

          let overlayBuf: Uint8ClampedArray | null = null;

          for (let ly = 0; ly < validH; ly++) {
            const rowBase = ly * rowStride;

            for (let lx = 0; lx < validW; lx++) {
              const off = rowBase + lx * BYTES_PER_PIXEL;
              const packed = (buf[off] << 16) | (buf[off + 1] << 8) | buf[off + 2];
              if (!numericColors.has(packed)) continue;

              // Check if border pixel (any neighbor is NOT a selected color)
              let isBorder = false;

              // Left neighbor
              if (lx === 0) {
                if (!leftBuf) {
                  isBorder = true;
                } else {
                  const lo = rowBase + (TILE_SIZE - 1) * BYTES_PER_PIXEL;
                  isBorder = !numericColors.has(
                    (leftBuf[lo] << 16) | (leftBuf[lo + 1] << 8) | leftBuf[lo + 2]
                  );
                }
              } else {
                const lo = off - BYTES_PER_PIXEL;
                isBorder = !numericColors.has(
                  (buf[lo] << 16) | (buf[lo + 1] << 8) | buf[lo + 2]
                );
              }

              // Right neighbor
              if (!isBorder) {
                if (lx === validW - 1) {
                  if (tileBaseX + validW >= this.mapWidth || !rightBuf) {
                    isBorder = true;
                  } else {
                    const ro = rowBase; // lx=0 in right tile, same ly
                    isBorder = !numericColors.has(
                      (rightBuf[ro] << 16) | (rightBuf[ro + 1] << 8) | rightBuf[ro + 2]
                    );
                  }
                } else {
                  const ro = off + BYTES_PER_PIXEL;
                  isBorder = !numericColors.has(
                    (buf[ro] << 16) | (buf[ro + 1] << 8) | buf[ro + 2]
                  );
                }
              }

              // Up neighbor
              if (!isBorder) {
                if (ly === 0) {
                  if (!upBuf) {
                    isBorder = true;
                  } else {
                    const uo = (TILE_SIZE - 1) * rowStride + lx * BYTES_PER_PIXEL;
                    isBorder = !numericColors.has(
                      (upBuf[uo] << 16) | (upBuf[uo + 1] << 8) | upBuf[uo + 2]
                    );
                  }
                } else {
                  const uo = off - rowStride;
                  isBorder = !numericColors.has(
                    (buf[uo] << 16) | (buf[uo + 1] << 8) | buf[uo + 2]
                  );
                }
              }

              // Down neighbor
              if (!isBorder) {
                if (ly === validH - 1) {
                  if (tileBaseY + validH >= this.mapHeight || !downBuf) {
                    isBorder = true;
                  } else {
                    const doff = lx * BYTES_PER_PIXEL; // ly=0 in down tile
                    isBorder = !numericColors.has(
                      (downBuf[doff] << 16) | (downBuf[doff + 1] << 8) | downBuf[doff + 2]
                    );
                  }
                } else {
                  const doff = off + rowStride;
                  isBorder = !numericColors.has(
                    (buf[doff] << 16) | (buf[doff + 1] << 8) | buf[doff + 2]
                  );
                }
              }

              // Lazy-allocate overlay buffer for this tile
              if (!overlayBuf) {
                overlayBuf = new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * BYTES_PER_PIXEL);
                this.overlayBuffers[tileIdx] = overlayBuf;
              }

              if (isBorder) {
                overlayBuf[off] = borderR;
                overlayBuf[off + 1] = borderG;
                overlayBuf[off + 2] = borderB;
                overlayBuf[off + 3] = borderA;
              } else {
                overlayBuf[off] = fillR;
                overlayBuf[off + 1] = fillG;
                overlayBuf[off + 2] = fillB;
                overlayBuf[off + 3] = fillA;
              }

              if (overlayBuf) this.overlayGpuDirty.add(tileIdx);
            }
          }
        }

        if (cursor < totalTiles) {
          setTimeout(processChunk, 0);
        } else {
          this.showOverlay = true;
          resolve();
        }
      };

      processChunk();
    });
  }

  /**
   * Find all tile indices that contain at least one pixel matching any color
   * in the given set. Uses packed 24-bit integer comparison for speed.
   * Synchronous — used to pre-discover tiles for undo snapshots.
   *
   * @param colorKeys - Set of rgbToKey strings for colors to find
   * @param tileSubset - Optional set of tile indices to search. When provided,
   *   only these tiles are checked. Use with SectorManager to restrict the search.
   */
  findTilesWithColors(colorKeys: Set<string>, tileSubset?: ReadonlySet<number>): Set<number> {
    const result = new Set<number>();
    if (!this.loaded || colorKeys.size === 0) return result;

    const numericColors = new Set<number>();
    for (const key of colorKeys) {
      const parts = key.split(',');
      numericColors.add(
        (parseInt(parts[0], 10) << 16) |
        (parseInt(parts[1], 10) << 8) |
        parseInt(parts[2], 10)
      );
    }

    const tilesToScan = tileSubset
      ? Array.from(tileSubset)
      : Array.from({ length: this.tilesX * this.tilesY }, (_, i) => i);

    for (const tileIdx of tilesToScan) {
      const tx = tileIdx % this.tilesX;
      const ty = Math.floor(tileIdx / this.tilesX);
      const buf = this.tileBuffers[tileIdx];
      const tileBaseX = tx * TILE_SIZE;
      const tileBaseY = ty * TILE_SIZE;
      const validW = Math.min(TILE_SIZE, this.mapWidth - tileBaseX);
      const validH = Math.min(TILE_SIZE, this.mapHeight - tileBaseY);
      const rowStride = TILE_SIZE * BYTES_PER_PIXEL;

      let found = false;
      for (let ly = 0; ly < validH && !found; ly++) {
        const rowBase = ly * rowStride;
        for (let lx = 0; lx < validW && !found; lx++) {
          const off = rowBase + lx * BYTES_PER_PIXEL;
          const packed = (buf[off] << 16) | (buf[off + 1] << 8) | buf[off + 2];
          if (numericColors.has(packed)) found = true;
        }
      }

      if (found) result.add(tileIdx);
    }

    return result;
  }

  /**
   * Replace all pixels of one color with another across the entire map.
   * Uses direct tile buffer access for performance (same pattern as
   * scanTilesForOverlay). Marks affected tiles as dirty for GPU re-upload
   * and save tracking.
   *
   * @param oldColor - The color to find and replace
   * @param newColor - The replacement color
   * @returns Affected tile indices and total pixel count replaced
   */
  replaceColorAsync(
    oldColor: RGB,
    newColor: RGB,
    tileSubset?: ReadonlySet<number>,
  ): Promise<{ affectedTiles: Set<number>; pixelCount: number }> {
    if (!this.loaded) return Promise.resolve({ affectedTiles: new Set(), pixelCount: 0 });

    const oldPacked = (oldColor.r << 16) | (oldColor.g << 8) | oldColor.b;
    const newR = newColor.r, newG = newColor.g, newB = newColor.b;

    const totalTiles = this.tilesX * this.tilesY;
    const tileIndices: number[] = tileSubset
      ? Array.from(tileSubset).filter(i => i >= 0 && i < totalTiles).sort((a, b) => a - b)
      : Array.from({ length: totalTiles }, (_, i) => i);
    const tileCount = tileIndices.length;
    const chunkSize = 4;
    let cursor = 0;
    const affectedTiles = new Set<number>();
    let pixelCount = 0;

    return new Promise((resolve) => {
      const processChunk = (): void => {
        const end = Math.min(cursor + chunkSize, tileCount);

        for (; cursor < end; cursor++) {
          const tileIdx = tileIndices[cursor];
          const tx = tileIdx % this.tilesX;
          const ty = Math.floor(tileIdx / this.tilesX);
          const buf = this.tileBuffers[tileIdx];

          const tileBaseX = tx * TILE_SIZE;
          const tileBaseY = ty * TILE_SIZE;
          const validW = Math.min(TILE_SIZE, this.mapWidth - tileBaseX);
          const validH = Math.min(TILE_SIZE, this.mapHeight - tileBaseY);
          const rowStride = TILE_SIZE * BYTES_PER_PIXEL;

          let tileHit = false;

          for (let ly = 0; ly < validH; ly++) {
            const rowBase = ly * rowStride;
            for (let lx = 0; lx < validW; lx++) {
              const off = rowBase + lx * BYTES_PER_PIXEL;
              const packed = (buf[off] << 16) | (buf[off + 1] << 8) | buf[off + 2];
              if (packed === oldPacked) {
                buf[off] = newR;
                buf[off + 1] = newG;
                buf[off + 2] = newB;
                // alpha stays 255
                pixelCount++;
                tileHit = true;
              }
            }
          }

          if (tileHit) {
            affectedTiles.add(tileIdx);
            this.dirtyTiles.add(tileIdx);
            this.gpuDirtyTiles.add(tileIdx);
          }
        }

        if (cursor < tileCount) {
          setTimeout(processChunk, 0);
        } else {
          resolve({ affectedTiles, pixelCount });
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
