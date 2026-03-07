/**
 * useCopyPaste — Hook for managing paste mode.
 *
 * When Ctrl+V is pressed and clipboard has data:
 * 1. Creates a paste preview texture in TileEngine at screen center
 * 2. User drags to reposition, scales/rotates via controls
 * 3. Accept writes transformed pixels to map, pushes undo, rescans sectors
 * 4. Cancel clears the preview
 */

import { useState, useCallback, useRef } from 'react';
import { rgbToKey } from '@shared/types';
import type { RGB, UndoAction, PendingProvince, CreateProvinceRequest } from '@shared/types';
import type { CopyPasteManager, ClipboardData } from '@tools/copy-paste-manager';
import type { TransformedBuffer } from '@tools/paste-transform';
import { transformBuffer } from '@tools/paste-transform';
import type { EngineRef, RegistryRef, UndoManagerRef, PendingMapRef } from './types';
import { TILE_SIZE } from '@shared/constants';

export interface UseCopyPasteParams {
  engineRef: EngineRef;
  registryRef: RegistryRef;
  undoManagerRef: UndoManagerRef;
  pendingMapRef: PendingMapRef;
  copyPasteManager: CopyPasteManager;
  setStatus: (msg: string) => void;
  setDraftDirty: (dirty: boolean) => void;
  setPendingCount: (count: number) => void;
  setProvinceCount: (count: number) => void;
  triggerForceUpdate: () => void;
}

/** Build an RGBA preview texture from transformed pixels + mask */
function buildPreviewTexture(buf: TransformedBuffer): Uint8ClampedArray {
  const preview = new Uint8ClampedArray(buf.width * buf.height * 4);
  for (let i = 0; i < buf.mask.length; i++) {
    if (buf.mask[i]) {
      const i4 = i * 4;
      preview[i4] = buf.pixels[i4];
      preview[i4 + 1] = buf.pixels[i4 + 1];
      preview[i4 + 2] = buf.pixels[i4 + 2];
      preview[i4 + 3] = 255;
    }
  }
  return preview;
}

export function useCopyPaste({
  engineRef, registryRef, undoManagerRef, pendingMapRef,
  copyPasteManager,
  setStatus, setDraftDirty, setPendingCount, setProvinceCount, triggerForceUpdate,
}: UseCopyPasteParams) {
  const [pasteMode, setPasteMode] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasteScale, setPasteScale] = useState(1);
  const [pasteRotation, setPasteRotation] = useState(0);
  const [pasteAdjustMode, setPasteAdjustMode] = useState<'scale' | 'rotation'>('scale');

  /** World position of the paste preview top-left */
  const pastePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  /** The original clipboard data */
  const activeClipboardRef = useRef<ClipboardData | null>(null);
  /** Current transformed buffer (what will actually be pasted) */
  const transformedRef = useRef<TransformedBuffer | null>(null);
  /** Refs for current scale/rotation (avoid stale closures) */
  const scaleRef = useRef(1);
  const rotationRef = useRef(0);

  /** Regenerate preview from original clipboard with current scale/rotation */
  const regeneratePreview = useCallback(() => {
    const engine = engineRef.current;
    const clipboard = activeClipboardRef.current;
    if (!engine || !clipboard) return;

    const scale = scaleRef.current;
    const rotation = rotationRef.current;

    const transformed = transformBuffer(
      clipboard.pixels, clipboard.mask,
      clipboard.width, clipboard.height,
      scale, rotation,
    );
    transformedRef.current = transformed;

    const preview = buildPreviewTexture(transformed);

    // Re-center on the same world point
    const bounds = engine.getPastePreviewBounds();
    if (bounds) {
      const centerX = pastePositionRef.current.x + bounds.w / 2;
      const centerY = pastePositionRef.current.y + bounds.h / 2;
      pastePositionRef.current.x = centerX - transformed.width / 2;
      pastePositionRef.current.y = centerY - transformed.height / 2;
    }

    engine.setPastePreview(
      preview, transformed.width, transformed.height,
      pastePositionRef.current.x, pastePositionRef.current.y,
    );
  }, [engineRef]);

  /** Enter paste mode: show preview at screen center */
  const handleStartPaste = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !engine.isLoaded()) return;

    const clipboard = copyPasteManager.getClipboard();
    if (!clipboard || clipboard.width === 0) {
      setStatus('Nothing to paste — copy something first');
      return;
    }

    // Reset transforms
    scaleRef.current = 1;
    rotationRef.current = 0;
    setPasteScale(1);
    setPasteRotation(0);

    activeClipboardRef.current = clipboard;
    transformedRef.current = {
      pixels: clipboard.pixels,
      mask: clipboard.mask,
      width: clipboard.width,
      height: clipboard.height,
    };

    const preview = buildPreviewTexture(transformedRef.current);

    // Compute world coords of screen center
    const camera = engine.getCamera();
    const canvas = engine.getCanvas();
    const centerScreenX = canvas.width / 2;
    const centerScreenY = canvas.height / 2;
    const worldX = Math.floor(camera.offsetX + centerScreenX / camera.zoom - clipboard.width / 2);
    const worldY = Math.floor(camera.offsetY + centerScreenY / camera.zoom - clipboard.height / 2);

    pastePositionRef.current = { x: worldX, y: worldY };

    engine.setPastePreview(preview, clipboard.width, clipboard.height, worldX, worldY);
    setPasteMode(true);
    setStatus(`Paste mode — drag to position (${clipboard.width}×${clipboard.height})`);
  }, [engineRef, copyPasteManager, setStatus]);

  /** Update paste preview position (called during drag) */
  const handlePasteDrag = useCallback((worldDx: number, worldDy: number) => {
    const engine = engineRef.current;
    if (!engine || !pasteMode) return;

    pastePositionRef.current.x += worldDx;
    pastePositionRef.current.y += worldDy;
    engine.updatePastePreviewPosition(pastePositionRef.current.x, pastePositionRef.current.y);
  }, [engineRef, pasteMode]);

  /** Adjust scale by a delta (e.g. ±0.1) */
  const handlePasteScale = useCallback((delta: number) => {
    const next = Math.max(0.1, Math.min(5, scaleRef.current + delta));
    scaleRef.current = next;
    setPasteScale(next);
    regeneratePreview();
  }, [regeneratePreview]);

  /** Adjust rotation by a delta in degrees (e.g. ±15) */
  const handlePasteRotate = useCallback((deltaDeg: number) => {
    const next = ((rotationRef.current + deltaDeg) % 360 + 360) % 360;
    rotationRef.current = next;
    setPasteRotation(next);
    regeneratePreview();
  }, [regeneratePreview]);

  /** Reset scale and rotation to identity */
  const handlePasteReset = useCallback(() => {
    scaleRef.current = 1;
    rotationRef.current = 0;
    setPasteScale(1);
    setPasteRotation(0);
    regeneratePreview();
  }, [regeneratePreview]);

  /** Handle Ctrl+wheel for fine-grained scale/rotation adjustment */
  const handlePasteWheel = useCallback((delta: number) => {
    if (pasteAdjustMode === 'scale') {
      // ~2% per wheel tick
      const next = Math.max(0.1, Math.min(5, scaleRef.current + delta * 0.02));
      scaleRef.current = next;
      setPasteScale(next);
    } else {
      // ~2° per wheel tick
      const next = ((rotationRef.current + delta * 2) % 360 + 360) % 360;
      rotationRef.current = next;
      setPasteRotation(next);
    }
    regeneratePreview();
  }, [pasteAdjustMode, regeneratePreview]);

  /** Cancel paste mode */
  const handlePasteCancel = useCallback(() => {
    const engine = engineRef.current;
    if (engine) engine.clearPastePreview();
    activeClipboardRef.current = null;
    transformedRef.current = null;
    setPasteMode(false);
    setStatus('Paste cancelled');
  }, [engineRef, setStatus]);

  /** Accept paste: write transformed pixels to map */
  const handlePasteAccept = useCallback(async () => {
    const engine = engineRef.current;
    const registry = registryRef.current;
    const undoManager = undoManagerRef.current;
    const buf = transformedRef.current;
    if (!engine || !engine.isLoaded() || !registry || !buf) return;

    setPasting(true);
    setStatus('Pasting...');

    try {
      const pasteX = Math.round(pastePositionRef.current.x);
      const pasteY = Math.round(pastePositionRef.current.y);
      const { width: mapWidth, height: mapHeight } = engine.getMapSize();
      const { tilesX } = engine.getTileGridSize();

      // 1. Determine which tiles are affected
      const affectedTiles = new Set<number>();
      const minTx = Math.max(0, Math.floor(pasteX / TILE_SIZE));
      const minTy = Math.max(0, Math.floor(pasteY / TILE_SIZE));
      const maxTx = Math.min(Math.ceil(mapWidth / TILE_SIZE) - 1, Math.floor((pasteX + buf.width) / TILE_SIZE));
      const maxTy = Math.min(Math.ceil(mapHeight / TILE_SIZE) - 1, Math.floor((pasteY + buf.height) / TILE_SIZE));

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          affectedTiles.add(ty * tilesX + tx);
        }
      }

      // 2. Snapshot tiles BEFORE
      const beforeSnapshots = new Map<number, Uint8ClampedArray>();
      for (const tileIdx of affectedTiles) {
        beforeSnapshots.set(tileIdx, engine.snapshotTile(tileIdx));
      }

      // 3. Write pixels from transformed buffer
      let pixelCount = 0;
      const newColors = new Set<string>();

      for (let ly = 0; ly < buf.height; ly++) {
        const gy = pasteY + ly;
        if (gy < 0 || gy >= mapHeight) continue;

        for (let lx = 0; lx < buf.width; lx++) {
          const idx = ly * buf.width + lx;
          if (!buf.mask[idx]) continue;

          const gx = pasteX + lx;
          if (gx < 0 || gx >= mapWidth) continue;

          const r = buf.pixels[idx * 4];
          const g = buf.pixels[idx * 4 + 1];
          const b = buf.pixels[idx * 4 + 2];

          engine.setPixel(gx, gy, { r, g, b });
          pixelCount++;

          const key = rgbToKey({ r, g, b });
          if (!registry.getProvinceByColor({ r, g, b })) {
            newColors.add(key);
          }
        }
      }

      // 4. Snapshot tiles AFTER
      const afterSnapshots = new Map<number, Uint8ClampedArray>();
      for (const tileIdx of affectedTiles) {
        afterSnapshots.set(tileIdx, engine.snapshotTile(tileIdx));
      }

      // 5. Auto-register new provinces (colors not in registry)
      const pendingAdded: PendingProvince[] = [];
      const pMap = pendingMapRef.current;

      for (const key of newColors) {
        if (pMap.has(key)) continue;

        const [r, g, b] = key.split(',').map(Number);
        const color: RGB = { r, g, b };
        const name = `Province_${r}_${g}_${b}`;

        const province = registry.registerProvince({ color, name });

        const request: CreateProvinceRequest = {
          name,
          color,
          titleTier: 'b',
        };
        const pendingEntry: PendingProvince = { id: province.id, color, name, request };
        pMap.add(pendingEntry);
        pendingAdded.push(pendingEntry);
      }

      // 6. Push undo action
      const action: UndoAction = {
        tileIndices: Array.from(affectedTiles),
        beforeSnapshots,
        afterSnapshots,
        description: `Paste ${pixelCount.toLocaleString()} pixels`,
        pendingAdded: pendingAdded.length > 0 ? pendingAdded : undefined,
      };
      undoManager.push(action);

      // 7. Rescan affected sectors
      const sm = registry.getSectorManager();
      if (sm.isPopulated) {
        sm.rescanByTiles(affectedTiles);
      }

      // 8. Update counts
      if (pendingAdded.length > 0) {
        setPendingCount(pMap.count);
        setProvinceCount(registry.count);
      }

      setDraftDirty(true);
      triggerForceUpdate();

      // 9. Clean up paste mode
      engine.clearPastePreview();
      activeClipboardRef.current = null;
      transformedRef.current = null;
      setPasteMode(false);

      const newMsg = pendingAdded.length > 0 ? ` (${pendingAdded.length} new province(s) registered)` : '';
      setStatus(`Pasted ${pixelCount.toLocaleString()} pixels${newMsg}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Paste error: ${msg}`);
    } finally {
      setPasting(false);
    }
  }, [engineRef, registryRef, undoManagerRef, pendingMapRef, setStatus, setDraftDirty, setPendingCount, setProvinceCount, triggerForceUpdate]);

  return {
    pasteMode,
    pasting,
    pasteScale,
    pasteRotation,
    handleStartPaste,
    handlePasteDrag,
    handlePasteCancel,
    handlePasteAccept,
    handlePasteScale,
    handlePasteRotate,
    handlePasteReset,
    handlePasteWheel,
    pasteAdjustMode,
    setPasteAdjustMode,
  };
}
