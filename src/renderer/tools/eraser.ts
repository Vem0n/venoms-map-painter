/**
 * Eraser — Paints pixels with the first "Define Empty" color.
 *
 * When Province Lock is active, only pixels matching the locked color
 * are erased. Otherwise, all pixels within the radius are overwritten.
 */

import { RGB } from '@shared/types';
import type { TileEngine } from '@engine/tile-engine';
import { brushPaint, brushLine, BrushOptions } from './brush';

export interface EraserOptions {
  /** The color to paint with (first empty color). */
  emptyColor: RGB;
  /** When set, only erase pixels matching this specific color (province lock). */
  isTargetColor?: (color: RGB) => boolean;
}

export function eraserPaint(engine: TileEngine, centerX: number, centerY: number, radius: number, options: EraserOptions) {
  const brushOpts: BrushOptions = {
    isTargetColor: options.isTargetColor,
  };
  return brushPaint(engine, centerX, centerY, radius, options.emptyColor, brushOpts);
}

export function eraserLine(engine: TileEngine, x0: number, y0: number, x1: number, y1: number, radius: number, options: EraserOptions) {
  const brushOpts: BrushOptions = {
    isTargetColor: options.isTargetColor,
  };
  return brushLine(engine, x0, y0, x1, y1, radius, options.emptyColor, brushOpts);
}
