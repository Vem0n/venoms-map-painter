/**
 * ProvinceGenerator — Voronoi-based auto province subdivision.
 *
 * Renders as a section in the Create tab. Workflow:
 * 1. User clicks "Select Province" → picks a color blob on the map
 * 2. Algorithm collects region pixels, detects components, generates seeds
 * 3. Preview shown as shader overlay (boundary lines)
 * 4. User adjusts count slider, clicks Regenerate/Cancel/Confirm
 * 5. On confirm: pixels repainted, provinces registered as pending
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { theme, sectionHeading, cardStyle, dividerStyle } from '../theme';
import type { RGB, ProvinceData } from '@shared/types';
import { rgbToKey } from '@shared/types';
import type { TileEngine } from '@engine/tile-engine';
import type { ColorRegistry } from '@registry/color-registry';
import type {
  GeneratorPhase, RegionData, VoronoiResult, VoronoiConfirmData,
} from '@tools/voronoi-types';
import { collectRegionPixels, generateSeeds, assignVoronoi, createRng } from '@tools/voronoi-generator';
import { writeVoronoiOverlay } from '@tools/voronoi-overlay';

interface ProvinceGeneratorProps {
  modLoaded: boolean;
  engineRef: React.RefObject<TileEngine | null>;
  registryRef: React.RefObject<ColorRegistry>;
  /** Trigger generator picking mode on the canvas */
  onStartPicking: () => void;
  /** Cancel picking mode */
  onCancelPicking: () => void;
  /** Whether we are currently in generator picking mode */
  pickingGenerator: boolean;
  /** The picked province (set after user clicks on map) */
  pickedProvince: { color: RGB; data: ProvinceData | null } | null;
  /** Called when user confirms generation */
  onConfirm: (data: VoronoiConfirmData) => void;
  /** Control overlay visibility */
  onOverlayChange: (visible: boolean) => void;
}

const MIN_COUNT = 2;
const MAX_COUNT = 100;
const DEFAULT_COUNT = 10;
const DEBOUNCE_MS = 300;

export default function ProvinceGenerator({
  modLoaded,
  engineRef,
  registryRef,
  onStartPicking,
  onCancelPicking,
  pickingGenerator,
  pickedProvince,
  onConfirm,
  onOverlayChange,
}: ProvinceGeneratorProps) {
  const [phase, setPhase] = useState<GeneratorPhase>('idle');
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [seedCounter, setSeedCounter] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [regionData, setRegionData] = useState<RegionData | null>(null);
  const [voronoiResult, setVoronoiResult] = useState<VoronoiResult | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef(false);

  // Run generation (phases 2+3+4) using cached region data
  const runGeneration = useCallback((region: RegionData, n: number, seed: number) => {
    const engine = engineRef.current;
    if (!engine) return;

    const effectiveCount = Math.min(n, region.count);
    const rng = createRng(seed);
    const seeds = generateSeeds(region, effectiveCount, rng);
    const result = assignVoronoi(region, seeds);

    // Clear old overlay, write new one
    engine.clearOverlay();
    writeVoronoiOverlay(engine, result);
    engine.setOverlayVisible(true);
    onOverlayChange(true);

    setVoronoiResult(result);
    setStatusText(
      `Preview: ${result.actualRegionCount} sub-provinces, ` +
      `${result.boundaryPixels.size} boundary px, ` +
      `${region.components.length} segment${region.components.length !== 1 ? 's' : ''}`
    );
    setPhase('previewing');
  }, [engineRef, onOverlayChange]);

  // When a province is picked, start pixel collection
  useEffect(() => {
    if (!pickedProvince || phase !== 'picking') return;

    const engine = engineRef.current;
    if (!engine || !engine.isLoaded()) return;

    const { color } = pickedProvince;

    // Reject empty/ocean color
    if (color.r === 0 && color.g === 0 && color.b === 0) {
      setStatusText('Cannot subdivide empty/ocean pixels');
      setPhase('idle');
      return;
    }

    abortRef.current = false;
    setPhase('collecting');
    setStatusText('Collecting region pixels...');

    // Use sector manager to restrict scan to tiles containing the target color
    const registry = registryRef.current;
    const sm = registry?.getSectorManager();
    const colorKey = rgbToKey(color);
    const tileSubset = sm?.isPopulated ? sm.getTilesForColors([colorKey]) : undefined;

    collectRegionPixels(engine, color, (_phase, progress) => {
      if (!abortRef.current) {
        setStatusText(`Collecting pixels... ${Math.round(progress * 100)}%`);
      }
    }, tileSubset).then((region) => {
      if (abortRef.current) return;

      if (region.count < 2) {
        setStatusText('Region too small to subdivide (need at least 2 pixels)');
        setPhase('idle');
        return;
      }

      setRegionData(region);
      setPhase('generating');
      setStatusText('Generating Voronoi subdivision...');

      // Use setTimeout to let React render the "generating" state
      setTimeout(() => {
        if (abortRef.current) return;
        runGeneration(region, count, seedCounter);
      }, 0);
    });
  }, [pickedProvince]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced re-generation when count or seed changes (only during preview)
  useEffect(() => {
    if (phase !== 'previewing' || !regionData) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runGeneration(regionData, count, seedCounter);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [count, seedCounter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectProvince = useCallback(() => {
    setPhase('picking');
    setStatusText('Click on a province blob on the map...');
    setRegionData(null);
    setVoronoiResult(null);
    setSeedCounter(0);
    setCount(DEFAULT_COUNT);
    onStartPicking();
  }, [onStartPicking]);

  const handleCancel = useCallback(() => {
    abortRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const engine = engineRef.current;
    if (engine) {
      engine.clearOverlay();
      engine.setOverlayVisible(false);
      onOverlayChange(false);
    }
    onCancelPicking();
    setPhase('idle');
    setStatusText('');
    setRegionData(null);
    setVoronoiResult(null);
  }, [engineRef, onCancelPicking, onOverlayChange]);

  const handleRegenerate = useCallback(() => {
    setSeedCounter(s => s + 1);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!voronoiResult || !regionData || !pickedProvince) return;
    setPhase('applying');
    setStatusText('Applying sub-provinces...');

    onConfirm({
      originalColor: pickedProvince.color,
      originalProvince: pickedProvince.data,
      result: voronoiResult,
      region: regionData,
    });

    // Reset
    setPhase('idle');
    setStatusText('');
    setRegionData(null);
    setVoronoiResult(null);
  }, [voronoiResult, regionData, pickedProvince, onConfirm]);

  const isActive = phase !== 'idle';
  const isPreviewing = phase === 'previewing';
  const effectiveCount = regionData ? Math.min(count, regionData.count) : count;

  return (
    <div>
      <h3 style={{
        ...sectionHeading(),
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        Generate Provinces
        <span style={{
          fontSize: theme.font.sizeXs,
          fontWeight: 600,
          color: theme.accent.yellow,
          background: 'rgba(255, 180, 0, 0.12)',
          padding: '2px 6px',
          borderRadius: theme.radius.sm,
          letterSpacing: '0.5px',
          textTransform: 'uppercase',
        }}>
          Experimental
        </span>
      </h3>

      {/* Warning banner */}
      <div style={warningBannerStyle}>
        The bigger the province the more compute heavy this operation is, even with
        optimizations in place. Do NOT try using it on continent-sized blobs &mdash;
        this tool is better suited for big kingdoms. If you don't adhere to this
        warning the program WILL MOST LIKELY CRASH.
      </div>

      {/* Idle / Select Province */}
      {phase === 'idle' && (
        <div>
          <p style={hintStyle}>
            Select a painted province blob to automatically subdivide it into
            multiple smaller provinces using Voronoi tessellation.
          </p>
          <button
            style={primaryBtnStyle}
            onClick={handleSelectProvince}
            disabled={!modLoaded}
          >
            Select Province
          </button>
        </div>
      )}

      {/* Picking mode */}
      {phase === 'picking' && (
        <div>
          <p style={hintStyle}>Click on a province blob on the map...</p>
          <button style={cancelBtnStyle} onClick={handleCancel}>Cancel</button>
        </div>
      )}

      {/* Collecting / Generating */}
      {(phase === 'collecting' || phase === 'generating') && (
        <div>
          <p style={{ ...hintStyle, color: theme.accent.blue }}>{statusText}</p>
          <button style={cancelBtnStyle} onClick={handleCancel}>Cancel</button>
        </div>
      )}

      {/* Previewing */}
      {isPreviewing && pickedProvince && regionData && voronoiResult && (
        <div>
          {/* Province info card */}
          <div style={{
            ...cardStyle(),
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: theme.space.md,
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: theme.radius.sm,
              border: `2px solid ${theme.border.default}`,
              background: `rgb(${pickedProvince.color.r},${pickedProvince.color.g},${pickedProvince.color.b})`,
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: theme.text.primary, fontSize: theme.font.sizeMd, fontWeight: 500 }}>
                {pickedProvince.data?.name ?? 'Unregistered blob'}
              </div>
              <div style={{ color: theme.text.muted, fontSize: theme.font.sizeXs }}>
                {regionData.count.toLocaleString()} pixels &middot; {regionData.components.length} segment{regionData.components.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Count slider */}
          <div style={{ marginBottom: theme.space.md }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 4,
            }}>
              <span style={labelSmall}>Sub-provinces</span>
              <span style={{
                color: theme.text.primary,
                fontSize: theme.font.sizeMd,
                fontWeight: 600,
                fontFamily: theme.font.mono,
              }}>
                {effectiveCount}
                {effectiveCount < count && (
                  <span style={{ color: theme.accent.yellow, fontWeight: 400, fontSize: theme.font.sizeXs }}>
                    {' '}(capped)
                  </span>
                )}
              </span>
            </div>
            <input
              type="range"
              min={MIN_COUNT}
              max={MAX_COUNT}
              value={count}
              onChange={e => setCount(parseInt(e.target.value, 10))}
              style={{ width: '100%', accentColor: theme.accent.blue }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={rangeLabelStyle}>{MIN_COUNT}</span>
              <span style={rangeLabelStyle}>{MAX_COUNT}</span>
            </div>
          </div>

          {/* Status */}
          <p style={{ color: theme.text.muted, fontSize: theme.font.sizeXs, margin: `0 0 ${theme.space.md}px` }}>
            {statusText}
          </p>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: theme.space.sm }}>
            <button style={cancelBtnStyle} onClick={handleCancel}>Cancel</button>
            <button style={secondaryBtnStyle} onClick={handleRegenerate}>Regenerate</button>
            <button style={confirmBtnStyle} onClick={handleConfirm}>Confirm</button>
          </div>
        </div>
      )}

      {/* Applying */}
      {phase === 'applying' && (
        <p style={{ ...hintStyle, color: theme.accent.green }}>{statusText}</p>
      )}
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────── */

const warningBannerStyle: React.CSSProperties = {
  background: 'rgba(255, 180, 0, 0.08)',
  border: `1px solid rgba(255, 180, 0, 0.25)`,
  borderRadius: theme.radius.md,
  padding: `${theme.space.sm}px ${theme.space.md}px`,
  color: theme.accent.yellow,
  fontSize: theme.font.sizeXs,
  lineHeight: 1.5,
  marginBottom: theme.space.md,
};

const hintStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeSm,
  lineHeight: 1.5,
  margin: `0 0 ${theme.space.md}px`,
};

const labelSmall: React.CSSProperties = {
  color: theme.text.secondary,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
};

const rangeLabelStyle: React.CSSProperties = {
  color: theme.text.muted,
  fontSize: theme.font.sizeXs,
};

const baseBtnStyle: React.CSSProperties = {
  padding: `${theme.space.sm}px ${theme.space.lg}px`,
  borderRadius: theme.radius.sm,
  fontSize: theme.font.sizeSm,
  fontFamily: theme.font.family,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  flex: 1,
};

const primaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.blue,
  color: '#fff',
};

const cancelBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.text.primary,
};

const secondaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.bg.elevated,
  color: theme.accent.blue,
};

const confirmBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  backgroundColor: theme.accent.green,
  color: '#fff',
};
