/**
 * ToolManager — Manages active tool state and dispatches input events to tools.
 *
 * Coordinates between TileEngine (pixel access), ColorRegistry (validation),
 * and UndoManager (snapshots).
 *
 * Every paint operation follows this flow:
 * 1. Snapshot affected tiles (before)
 * 2. Execute the tool
 * 3. Snapshot affected tiles (after)
 * 4. Push undo action
 */

import { ToolType, RGB, UndoAction, rgbToKey } from '@shared/types';
import { TILE_SIZE } from '@shared/constants';
import type { TileEngine } from '@engine/tile-engine';
import type { ColorRegistry } from '@registry/color-registry';
import type { UndoManager } from '@engine/undo-manager';
import { floodFill } from './flood-fill';
import { brushPaint, brushLine } from './brush';
import { eraserPaint, eraserLine } from './eraser';

export interface PaintEvent {
  /** Which tool performed the action */
  tool: ToolType;
  /** Number of pixels affected */
  pixelCount: number;
  /** Warning message if color validation produced a non-blocking warning */
  warning?: string;
}

export class ToolManager {
  private activeTool: ToolType = 'flood-fill';
  private activeColor: RGB = { r: 255, g: 0, b: 0 };
  private brushRadius: number = 3;
  private respectBorders: boolean = true;

  /** Set of colors considered "empty" (paintable when respectBorders is on) */
  private emptyColors: Set<string> = new Set(['0,0,0']);

  /** When set, painting is restricted to only pixels matching this color */
  private lockedColor: RGB | null = null;

  private engine: TileEngine;
  private registry: ColorRegistry;
  private undoManager: UndoManager;

  /** Last drag position for brush interpolation */
  private lastDragPos: { gx: number; gy: number } | null = null;

  /** Whether a drag operation is in progress */
  private dragging = false;

  /** Tiles affected during the current drag operation (for single undo action) */
  private dragAffectedTiles: Set<number> = new Set();

  /** Before-snapshots taken at drag start */
  private dragBeforeSnapshots: Map<number, Uint8ClampedArray> = new Map();

  /** Callback for paint events (UI updates) */
  private onPaintEvent: ((event: PaintEvent) => void) | null = null;

  constructor(engine: TileEngine, registry: ColorRegistry, undoManager: UndoManager) {
    this.engine = engine;
    this.registry = registry;
    this.undoManager = undoManager;
  }

  setTool(tool: ToolType): void {
    this.activeTool = tool;
  }

  getTool(): ToolType {
    return this.activeTool;
  }

  setColor(color: RGB): void {
    this.activeColor = color;
  }

  getColor(): RGB {
    return { ...this.activeColor };
  }

  setBrushRadius(radius: number): void {
    this.brushRadius = Math.max(0, Math.min(50, radius));
  }

  getBrushRadius(): number {
    return this.brushRadius;
  }

  setRespectBorders(value: boolean): void {
    this.respectBorders = value;
  }

  getRespectBorders(): boolean {
    return this.respectBorders;
  }

  /** Add a color to the set of colors considered "empty" */
  addEmptyColor(color: RGB): void {
    this.emptyColors.add(rgbToKey(color));
  }

  /** Remove a color from the empty colors set */
  removeEmptyColor(color: RGB): void {
    this.emptyColors.delete(rgbToKey(color));
  }

  /** Clear all empty colors and reset to default (black only) */
  resetEmptyColors(): void {
    this.emptyColors.clear();
    this.emptyColors.add('0,0,0');
  }

  /** Check if a color is considered empty */
  isEmptyColor(color: RGB): boolean {
    return this.emptyColors.has(rgbToKey(color));
  }

  /** Get all registered empty colors as RGB arrays */
  getEmptyColors(): RGB[] {
    return Array.from(this.emptyColors).map(key => {
      const [r, g, b] = key.split(',').map(Number);
      return { r, g, b };
    });
  }

  /** Lock painting to only affect pixels of a specific color */
  setLockedColor(color: RGB | null): void {
    this.lockedColor = color;
  }

  /** Get the currently locked color, or null if no lock */
  getLockedColor(): RGB | null {
    return this.lockedColor ? { ...this.lockedColor } : null;
  }

  /** Build a check function for the current locked color, or undefined if not locked */
  private getLockedColorCheck(): ((c: RGB) => boolean) | undefined {
    if (!this.lockedColor) return undefined;
    const lr = this.lockedColor.r;
    const lg = this.lockedColor.g;
    const lb = this.lockedColor.b;
    return (c: RGB) => c.r === lr && c.g === lg && c.b === lb;
  }

  /** Get the first defined empty color (used as the eraser paint color) */
  private getFirstEmptyColor(): RGB {
    const first = this.emptyColors.values().next().value;
    if (first) {
      const [r, g, b] = first.split(',').map(Number);
      return { r, g, b };
    }
    return { r: 0, g: 0, b: 0 };
  }

  /** Set a callback for paint events (pixel counts, warnings) */
  setOnPaintEvent(cb: (event: PaintEvent) => void): void {
    this.onPaintEvent = cb;
  }

  /**
   * Handle a click/paint event at global coordinates.
   * Dispatches to the appropriate tool implementation.
   */
  handlePaint(gx: number, gy: number): PaintEvent | null {
    if (!this.engine.isLoaded()) return null;

    // Validate color — non-blocking warning if color belongs to another province
    const warning = this.validateColor(this.activeColor);

    const emptyCheck = (c: RGB) => this.isEmptyColor(c);
    const lockedCheck = this.getLockedColorCheck();

    switch (this.activeTool) {
      case 'flood-fill':
        return this.executeFloodFill(gx, gy, warning, emptyCheck, lockedCheck);
      case 'brush':
        return this.executeBrushPaint(gx, gy, warning, emptyCheck, lockedCheck);
      case 'eraser':
        return this.executeEraserPaint(gx, gy);
      default:
        return null;
    }
  }

  /**
   * Start a drag operation (mouse down with left button).
   */
  handleDragStart(gx: number, gy: number): void {
    if (!this.engine.isLoaded()) return;
    if (this.activeTool !== 'brush' && this.activeTool !== 'eraser') return;

    this.dragging = true;
    this.lastDragPos = { gx, gy };
    this.dragAffectedTiles.clear();
    this.dragBeforeSnapshots.clear();

    // Snapshot tiles around the initial point preemptively
    this.snapshotTilesAroundPoint(gx, gy, this.brushRadius);

    // Paint the initial point
    if (this.activeTool === 'brush') {
      const result = brushPaint(this.engine, gx, gy, this.brushRadius, this.activeColor, {
        respectBorders: this.respectBorders,
        isEmptyColor: (c) => this.isEmptyColor(c),
        isTargetColor: this.getLockedColorCheck(),
      });
      this.mergeDragTiles(result.affectedTiles);
    } else {
      const eraserOpts = { emptyColor: this.getFirstEmptyColor(), isTargetColor: this.getLockedColorCheck() };
      const result = eraserPaint(this.engine, gx, gy, this.brushRadius, eraserOpts);
      this.mergeDragTiles(result.affectedTiles);
    }
  }

  /**
   * Continue a drag operation (mouse move while dragging).
   */
  handleDragMove(gx: number, gy: number): void {
    if (!this.dragging || !this.lastDragPos) return;

    const { gx: lastGx, gy: lastGy } = this.lastDragPos;

    // Snapshot any new tiles that the line might touch
    this.snapshotTilesAlongLine(lastGx, lastGy, gx, gy, this.brushRadius);

    // Draw a line from last position to current position
    if (this.activeTool === 'brush') {
      const result = brushLine(this.engine, lastGx, lastGy, gx, gy, this.brushRadius, this.activeColor, {
        respectBorders: this.respectBorders,
        isEmptyColor: (c) => this.isEmptyColor(c),
        isTargetColor: this.getLockedColorCheck(),
      });
      this.mergeDragTiles(result.affectedTiles);
    } else if (this.activeTool === 'eraser') {
      const eraserOpts = { emptyColor: this.getFirstEmptyColor(), isTargetColor: this.getLockedColorCheck() };
      const result = eraserLine(this.engine, lastGx, lastGy, gx, gy, this.brushRadius, eraserOpts);
      this.mergeDragTiles(result.affectedTiles);
    }

    this.lastDragPos = { gx, gy };
  }

  /**
   * End a drag operation (mouse up). Creates a single undo action for the whole stroke.
   */
  handleDragEnd(): PaintEvent | null {
    if (!this.dragging) return null;
    this.dragging = false;
    this.lastDragPos = null;

    if (this.dragAffectedTiles.size === 0) return null;

    // Build after-snapshots for all affected tiles
    const afterSnapshots = new Map<number, Uint8ClampedArray>();
    const tileIndices: number[] = [];
    for (const tileIndex of this.dragAffectedTiles) {
      afterSnapshots.set(tileIndex, this.engine.snapshotTile(tileIndex));
      tileIndices.push(tileIndex);
    }

    const toolName = this.activeTool === 'eraser' ? 'Erase' : 'Brush';
    const action: UndoAction = {
      tileIndices,
      beforeSnapshots: new Map(this.dragBeforeSnapshots),
      afterSnapshots,
      description: `${toolName} stroke`,
    };
    this.undoManager.push(action);

    this.dragAffectedTiles.clear();
    this.dragBeforeSnapshots.clear();

    const event: PaintEvent = { tool: this.activeTool, pixelCount: -1 };
    this.onPaintEvent?.(event);
    return event;
  }

  /** Whether a drag is currently in progress */
  isDragging(): boolean {
    return this.dragging;
  }

  /**
   * Undo the last action, restoring tile snapshots.
   */
  undo(): boolean {
    const action = this.undoManager.undo();
    if (!action) return false;

    for (const tileIndex of action.tileIndices) {
      const snapshot = action.beforeSnapshots.get(tileIndex);
      if (snapshot) {
        this.engine.restoreTile(tileIndex, snapshot);
      }
    }
    return true;
  }

  /**
   * Redo the last undone action.
   */
  redo(): boolean {
    const action = this.undoManager.redo();
    if (!action) return false;

    for (const tileIndex of action.tileIndices) {
      const snapshot = action.afterSnapshots.get(tileIndex);
      if (snapshot) {
        this.engine.restoreTile(tileIndex, snapshot);
      }
    }
    return true;
  }

  get canUndo(): boolean {
    return this.undoManager.canUndo;
  }

  get canRedo(): boolean {
    return this.undoManager.canRedo;
  }

  /**
   * Validate the paint color against the registry.
   * Returns a warning string if the color belongs to another province, undefined otherwise.
   */
  private validateColor(color: RGB): string | undefined {
    if (!this.registry.isColorUsed(color)) return undefined;
    const province = this.registry.getProvinceByColor(color);
    if (province) {
      return `Color belongs to province ${province.id} (${province.name}) — painting will expand this province`;
    }
    return undefined;
  }

  /** Execute flood fill with undo wrapping */
  private executeFloodFill(gx: number, gy: number, warning?: string, isEmptyColor?: (c: RGB) => boolean, isTargetColor?: (c: RGB) => boolean): PaintEvent {
    // Lazy snapshots: only snapshot tiles the moment they're first touched,
    // rather than snapshotting all 128+ tiles upfront (~128MB).
    const beforeSnapshots = new Map<number, Uint8ClampedArray>();
    const onNewTile = (tileIndex: number): void => {
      beforeSnapshots.set(tileIndex, this.engine.snapshotTile(tileIndex));
    };

    const result = floodFill(this.engine, gx, gy, this.activeColor, {
      respectBorders: this.respectBorders, isEmptyColor, isTargetColor, onNewTile,
    });

    if (result.pixelCount === 0) {
      return { tool: 'flood-fill', pixelCount: 0, warning };
    }

    const tileIndices = Array.from(result.affectedTiles);
    const afterSnapshots = new Map<number, Uint8ClampedArray>();
    for (const tileIndex of tileIndices) {
      afterSnapshots.set(tileIndex, this.engine.snapshotTile(tileIndex));
    }

    const action: UndoAction = {
      tileIndices,
      beforeSnapshots,
      afterSnapshots,
      description: `Flood fill (${result.pixelCount} pixels)`,
    };
    this.undoManager.push(action);

    const event: PaintEvent = { tool: 'flood-fill', pixelCount: result.pixelCount, warning };
    this.onPaintEvent?.(event);
    return event;
  }

  /** Execute single brush stamp with undo wrapping */
  private executeBrushPaint(gx: number, gy: number, warning?: string, isEmptyColor?: (c: RGB) => boolean, isTargetColor?: (c: RGB) => boolean): PaintEvent {
    const beforeSnapshots = this.snapshotTilesInRadius(gx, gy, this.brushRadius);

    const result = brushPaint(this.engine, gx, gy, this.brushRadius, this.activeColor, { respectBorders: this.respectBorders, isEmptyColor, isTargetColor });

    if (result.pixelCount === 0) {
      return { tool: 'brush', pixelCount: 0, warning };
    }

    const tileIndices = Array.from(result.affectedTiles);
    const afterSnapshots = new Map<number, Uint8ClampedArray>();
    for (const tileIndex of tileIndices) {
      afterSnapshots.set(tileIndex, this.engine.snapshotTile(tileIndex));
    }

    const action: UndoAction = {
      tileIndices,
      beforeSnapshots,
      afterSnapshots,
      description: `Brush paint (${result.pixelCount} pixels)`,
    };
    this.undoManager.push(action);

    const event: PaintEvent = { tool: 'brush', pixelCount: result.pixelCount, warning };
    this.onPaintEvent?.(event);
    return event;
  }

  /** Execute single eraser stamp with undo wrapping */
  private executeEraserPaint(gx: number, gy: number): PaintEvent {
    const beforeSnapshots = this.snapshotTilesInRadius(gx, gy, this.brushRadius);

    const eraserOpts = { emptyColor: this.getFirstEmptyColor(), isTargetColor: this.getLockedColorCheck() };
    const result = eraserPaint(this.engine, gx, gy, this.brushRadius, eraserOpts);

    if (result.pixelCount === 0) {
      return { tool: 'eraser', pixelCount: 0 };
    }

    const tileIndices = Array.from(result.affectedTiles);
    const afterSnapshots = new Map<number, Uint8ClampedArray>();
    for (const tileIndex of tileIndices) {
      afterSnapshots.set(tileIndex, this.engine.snapshotTile(tileIndex));
    }

    const action: UndoAction = {
      tileIndices,
      beforeSnapshots,
      afterSnapshots,
      description: `Erase (${result.pixelCount} pixels)`,
    };
    this.undoManager.push(action);

    const event: PaintEvent = { tool: 'eraser', pixelCount: result.pixelCount };
    this.onPaintEvent?.(event);
    return event;
  }

  /** Snapshot tiles that a brush of given radius at (cx, cy) could touch */
  private snapshotTilesInRadius(cx: number, cy: number, radius: number): Map<number, Uint8ClampedArray> {
    const { width: mapWidth, height: mapHeight } = this.engine.getMapSize();
    const tilesX = Math.ceil(mapWidth / TILE_SIZE);
    const tilesY = Math.ceil(mapHeight / TILE_SIZE);
    const snapshots = new Map<number, Uint8ClampedArray>();

    const minTx = Math.max(0, Math.floor((cx - radius) / TILE_SIZE));
    const maxTx = Math.min(tilesX - 1, Math.floor((cx + radius) / TILE_SIZE));
    const minTy = Math.max(0, Math.floor((cy - radius) / TILE_SIZE));
    const maxTy = Math.min(tilesY - 1, Math.floor((cy + radius) / TILE_SIZE));

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tileIndex = ty * tilesX + tx;
        snapshots.set(tileIndex, this.engine.snapshotTile(tileIndex));
      }
    }

    return snapshots;
  }

  /** Snapshot tiles around a point for drag operations (only if not already snapshotted) */
  private snapshotTilesAroundPoint(cx: number, cy: number, radius: number): void {
    const { width: mapWidth, height: mapHeight } = this.engine.getMapSize();
    const tilesX = Math.ceil(mapWidth / TILE_SIZE);
    const tilesY = Math.ceil(mapHeight / TILE_SIZE);

    const minTx = Math.max(0, Math.floor((cx - radius) / TILE_SIZE));
    const maxTx = Math.min(tilesX - 1, Math.floor((cx + radius) / TILE_SIZE));
    const minTy = Math.max(0, Math.floor((cy - radius) / TILE_SIZE));
    const maxTy = Math.min(tilesY - 1, Math.floor((cy + radius) / TILE_SIZE));

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tileIndex = ty * tilesX + tx;
        if (!this.dragBeforeSnapshots.has(tileIndex)) {
          this.dragBeforeSnapshots.set(tileIndex, this.engine.snapshotTile(tileIndex));
        }
      }
    }
  }

  /** Snapshot tiles along a line for drag operations */
  private snapshotTilesAlongLine(x0: number, y0: number, x1: number, y1: number, radius: number): void {
    this.snapshotTilesAroundPoint(x0, y0, radius);
    this.snapshotTilesAroundPoint(x1, y1, radius);

    // For long lines, also snapshot midpoints
    const dist = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    if (dist > TILE_SIZE) {
      const steps = Math.ceil(dist / TILE_SIZE);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const mx = Math.round(x0 + (x1 - x0) * t);
        const my = Math.round(y0 + (y1 - y0) * t);
        this.snapshotTilesAroundPoint(mx, my, radius);
      }
    }
  }

  /** Merge newly affected tiles into the drag tracking set */
  private mergeDragTiles(tiles: Set<number>): void {
    for (const tile of tiles) {
      this.dragAffectedTiles.add(tile);
    }
  }
}
