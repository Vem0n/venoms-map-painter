/**
 * Tabler Outline SVGs adapted to the app's size/color/style component API.
 * Copyright (c) 2020-2026 Paweł Kuna — MIT License.
 * Full license: THIRD_PARTY_NOTICES.txt. Source mapping: docs/ICONS.md.
 * Upstream commit: a4ce1404bc6d24d3c365afe7b258d6bf6f48d62d
 * Geometry is vendored locally; no icon package or network access at runtime.
 */

import React from 'react';

interface IconProps {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}

function createIcon(name: string, paths: React.ReactNode) {
  function TablerIcon({ size = 18, color = 'currentColor', style }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false" style={style}>
        {paths}
      </svg>
    );
  }
  TablerIcon.displayName = `Tabler(${name})`;
  return TablerIcon;
}

export const FloodFillIcon = createIcon('bucket-droplet', <>
  <path d="M5 16l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737" />
  <path d="M13.737 9.737c2.299 -2.3 3.23 -5.095 2.081 -6.245c-1.15 -1.15 -3.945 -.217 -6.244 2.082c-2.3 2.299 -3.231 5.095 -2.082 6.244c1.15 1.15 3.946 .218 6.245 -2.081" />
  <path d="M7.492 11.818c.362 .362 .768 .676 1.208 .934l6.895 4.047c1.078 .557 2.255 -.075 3.692 -1.512c1.437 -1.437 2.07 -2.614 1.512 -3.692c-.372 -.718 -1.72 -3.017 -4.047 -6.895a6.015 6.015 0 0 0 -.934 -1.208" />
</>);

export const BrushIcon = createIcon('brush', <>
  <path d="M3 21v-4a4 4 0 1 1 4 4h-4" />
  <path d="M21 3a16 16 0 0 0 -12.8 10.2" />
  <path d="M21 3a16 16 0 0 1 -10.2 12.8" />
  <path d="M10.6 9a9 9 0 0 1 4.4 4.4" />
</>);

export const EraserIcon = createIcon('eraser', <>
  <path d="M19 20h-10.5l-4.21 -4.3a1 1 0 0 1 0 -1.41l10 -10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
  <path d="M18 13.3l-6.3 -6.3" />
</>);

export const EyedropperIcon = createIcon('color-picker', <>
  <path d="M11 7l6 6" />
  <path d="M4 16l11.7 -11.7a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4l-11.7 11.7h-4v-4" />
</>);

export const GridIcon = createIcon('grid-3x3', <>
  <path d="M3 8h18" />
  <path d="M3 16h18" />
  <path d="M8 3v18" />
  <path d="M16 3v18" />
</>);

export const LockIcon = createIcon('lock', <>
  <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6" />
  <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
  <path d="M8 11v-4a4 4 0 1 1 8 0v4" />
</>);

export const LockOpenIcon = createIcon('lock-open', <>
  <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -6" />
  <path d="M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  <path d="M8 11v-5a4 4 0 0 1 8 0" />
</>);

export const EmptyColorIcon = createIcon('background', <>
  <path d="M4 8l4 -4" />
  <path d="M14 4l-10 10" />
  <path d="M4 20l16 -16" />
  <path d="M20 10l-10 10" />
  <path d="M20 16l-4 4" />
</>);

export const UndoIcon = createIcon('arrow-back-up', <>
  <path d="M9 14l-4 -4l4 -4" />
  <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
</>);

export const RedoIcon = createIcon('arrow-forward-up', <>
  <path d="M15 14l4 -4l-4 -4" />
  <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
</>);

export const FolderOpenIcon = createIcon('folder-open', <>
  <path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2" />
</>);

export const SaveIcon = createIcon('device-floppy', <>
  <path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" />
  <path d="M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
  <path d="M14 4l0 4l-6 0l0 -4" />
</>);

export const SearchIcon = createIcon('search', <>
  <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
  <path d="M21 21l-6 -6" />
</>);

export const XIcon = createIcon('x', <>
  <path d="M18 6l-12 12" />
  <path d="M6 6l12 12" />
</>);

export const ChevronDownIcon = createIcon('chevron-down', <>
  <path d="M6 9l6 6l6 -6" />
</>);

export const InspectIcon = createIcon('eye-search', <>
  <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
  <path d="M12 18c-.328 0 -.652 -.017 -.97 -.05c-3.172 -.332 -5.85 -2.315 -8.03 -5.95c2.4 -4 5.4 -6 9 -6c3.465 0 6.374 1.853 8.727 5.558" />
  <path d="M15 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
  <path d="M20.2 20.2l1.8 1.8" />
</>);

export const HeightmapIcon = createIcon('mountain', <>
  <path d="M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612" />
  <path d="M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2" />
</>);

export const LassoIcon = createIcon('lasso', <>
  <path d="M4.028 13.252c-.657 -.972 -1.028 -2.078 -1.028 -3.252c0 -3.866 4.03 -7 9 -7s9 3.134 9 7s-4.03 7 -9 7c-1.913 0 -3.686 -.464 -5.144 -1.255" />
  <path d="M3 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
  <path d="M5 17c0 1.42 .316 2.805 1 4" />
</>);

export const BordersIcon = createIcon('border-outer', <>
  <path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" />
  <path d="M12 8l0 .01" />
  <path d="M8 12l0 .01" />
  <path d="M12 12l0 .01" />
  <path d="M16 12l0 .01" />
  <path d="M12 16l0 .01" />
</>);

export const PaletteIcon = createIcon('palette', <>
  <path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25" />
  <path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  <path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  <path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
</>);

export const CopyIcon = createIcon('copy', <>
  <path d="M7 9.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667l0 -8.666" />
  <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
</>);

export const CheckIcon = createIcon('check', <>
  <path d="M5 12l5 5l10 -10" />
</>);

export const ProjectsIcon = createIcon('folders', <>
  <path d="M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
  <path d="M17 16v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
</>);

export const LoadDraftIcon = createIcon('file-import', <>
  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
  <path d="M5 13v-8a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-5.5m-9.5 -2h7m-3 -3l3 3l-3 3" />
</>);

export const SaveDraftIcon = createIcon('file-pencil', <>
  <path d="M14 3v4a1 1 0 0 0 1 1h4" />
  <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2" />
  <path d="M10 18l5 -5a1.414 1.414 0 0 0 -2 -2l-5 5v2h2" />
</>);
