/**
 * CopyPasteManager — Global clipboard for cross-tab copy-paste.
 *
 * Stores pixel data from lasso selections (province select or normal select).
 * Owned by TabShell, shared across all App instances so users can copy
 * in one tab and paste in another.
 */

export type SelectMode = 'province' | 'normal';

/** Bounding-box-sized pixel buffer with a selection mask */
export interface ClipboardData {
  /** RGBA pixel data (width × height × 4) */
  pixels: Uint8ClampedArray;
  /** Per-pixel mask: 1 = included, 0 = excluded */
  mask: Uint8Array;
  /** Bounding box width */
  width: number;
  /** Bounding box height */
  height: number;
  /** Which select mode was used to create this clipboard */
  mode: SelectMode;
}

export class CopyPasteManager {
  private clipboard: ClipboardData | null = null;

  /** Store pixel data in the clipboard */
  copy(data: ClipboardData): void {
    this.clipboard = data;
  }

  /** Retrieve the current clipboard data (or null) */
  getClipboard(): ClipboardData | null {
    return this.clipboard;
  }

  /** Whether clipboard has data */
  hasClipboard(): boolean {
    return this.clipboard !== null;
  }

  /** Clear the clipboard */
  clear(): void {
    this.clipboard = null;
  }
}
