/** Shared ref type aliases for custom hooks */

import type { MutableRefObject } from 'react';
import type { TileEngine } from '@engine/tile-engine';
import type { UndoManager } from '@engine/undo-manager';
import type { ColorRegistry } from '@registry/color-registry';
import type { ToolManager } from '@tools/tool-manager';
import type { PendingProvinceMap } from '@registry/pending-province-map';

export type EngineRef = MutableRefObject<TileEngine | null>;
export type UndoManagerRef = MutableRefObject<UndoManager>;
export type RegistryRef = MutableRefObject<ColorRegistry>;
export type ToolManagerRef = MutableRefObject<ToolManager | null>;
export type PendingMapRef = MutableRefObject<PendingProvinceMap>;
export type ModPathRef = MutableRefObject<string | null>;

export type SidebarMode = 'painting' | 'inspector' | 'creator' | 'pending';
