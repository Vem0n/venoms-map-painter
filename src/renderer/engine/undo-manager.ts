/**
 * UndoManager — Per-tile snapshot based undo/redo system.
 * 
 * Before each paint operation, snapshots of affected tiles are stored.
 * This is memory-heavy but simple and fast — each tile snapshot is ~1MB
 * (512×512×4 bytes), and typical operations touch 1-3 tiles.
 * 
 * Memory budget: ~100 undo steps × ~3MB average = ~300MB worst case.
 */

import { UndoAction } from '@shared/types';

const MAX_UNDO_STEPS = 100;

export class UndoManager {
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];

  /**
   * Record an action that can be undone.
   * Call this AFTER performing the paint operation.
   */
  push(action: UndoAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > MAX_UNDO_STEPS) {
      this.undoStack.shift(); // evict oldest
    }
    // Any new action invalidates the redo stack
    this.redoStack = [];
  }

  /**
   * Undo the last action. Returns the action so the caller
   * can restore tile snapshots via TileEngine.restoreTile().
   */
  undo(): UndoAction | undefined {
    const action = this.undoStack.pop();
    if (action) {
      this.redoStack.push(action);
    }
    return action;
  }

  /**
   * Redo the last undone action.
   */
  redo(): UndoAction | undefined {
    const action = this.redoStack.pop();
    if (action) {
      this.undoStack.push(action);
    }
    return action;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Clear all history (e.g., on new file load) */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
