'use client';

import { useMemo } from 'react';
import {
  ADULT_QUADRANTS,
  DECIDUOUS_QUADRANTS,
  STATUS_FILL,
  FINDING_FILL,
  type Dentition,
  type ToothEntryRecord,
  type ToothStatus,
  type ToothSurface,
} from '../schemas/dental';

const TOOTH_W = 32;
const TOOTH_H = 40;
const GAP_X = 4;
const ROW_GAP = 14;

interface ToothRenderState {
  status: ToothStatus;
  surfaces: Partial<Record<ToothSurface, string>>; // surface → fill color
}

function renderTooth(
  toothCode: string,
  state: ToothRenderState | undefined,
  selected: boolean,
  onClick?: (code: string) => void,
) {
  const status = state?.status ?? 'PRESENT';
  const baseFill = STATUS_FILL[status];
  const surfaces = state?.surfaces ?? {};
  const interactive = !!onClick;
  const opacity =
    status === 'MISSING' || status === 'EXTRACTED' ? 0.35 : 1;

  // Surface layout (5-zone tooth):
  // outer rect = base; inner cross divides into M (left), D (right),
  // B (top), L (bottom), and O (center).
  const cx = TOOTH_W / 2;
  const cy = TOOTH_H / 2 - 2; // slight offset for tooth label below
  const w = TOOTH_W - 6;
  const h = TOOTH_H - 14;
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  const inset = Math.min(w, h) * 0.28;

  return (
    <g
      key={toothCode}
      transform={`translate(0,0)`}
      onClick={interactive ? () => onClick(toothCode) : undefined}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
      opacity={opacity}
    >
      {/* outer outline */}
      <rect
        x={x0}
        y={y0}
        width={w}
        height={h}
        rx={4}
        fill={baseFill}
        stroke={selected ? '#2563eb' : '#374151'}
        strokeWidth={selected ? 2 : 1}
      />
      {/* B (top) */}
      <polygon
        points={`${x0},${y0} ${x0 + w},${y0} ${x0 + w - inset},${y0 + inset} ${x0 + inset},${y0 + inset}`}
        fill={surfaces.B ?? 'transparent'}
      />
      {/* L (bottom) */}
      <polygon
        points={`${x0 + inset},${y0 + h - inset} ${x0 + w - inset},${y0 + h - inset} ${x0 + w},${y0 + h} ${x0},${y0 + h}`}
        fill={surfaces.L ?? 'transparent'}
      />
      {/* M (left) */}
      <polygon
        points={`${x0},${y0} ${x0 + inset},${y0 + inset} ${x0 + inset},${y0 + h - inset} ${x0},${y0 + h}`}
        fill={surfaces.M ?? 'transparent'}
      />
      {/* D (right) */}
      <polygon
        points={`${x0 + w},${y0} ${x0 + w},${y0 + h} ${x0 + w - inset},${y0 + h - inset} ${x0 + w - inset},${y0 + inset}`}
        fill={surfaces.D ?? 'transparent'}
      />
      {/* O (center) */}
      <rect
        x={x0 + inset}
        y={y0 + inset}
        width={w - inset * 2}
        height={h - inset * 2}
        fill={surfaces.O ?? 'transparent'}
      />
      {/* status overlays for missing/extracted */}
      {(status === 'MISSING' || status === 'EXTRACTED') && (
        <line
          x1={x0}
          y1={y0}
          x2={x0 + w}
          y2={y0 + h}
          stroke="#dc2626"
          strokeWidth={2}
        />
      )}
      {/* tooth label */}
      <text
        x={cx}
        y={TOOTH_H - 1}
        textAnchor="middle"
        fontSize={9}
        fill="#374151"
      >
        {toothCode}
      </text>
    </g>
  );
}

function renderRow(
  codes: string[],
  byCode: Map<string, ToothRenderState>,
  selectedCode: string | undefined,
  onClick?: (code: string) => void,
) {
  return codes.map((code, i) => (
    <g key={code} transform={`translate(${i * (TOOTH_W + GAP_X)},0)`}>
      {renderTooth(code, byCode.get(code), selectedCode === code, onClick)}
    </g>
  ));
}

export interface OdontogramProps {
  dentition: Dentition;
  teeth: ToothEntryRecord[];
  selectedTooth?: string;
  onSelectTooth?: (toothCode: string) => void;
  className?: string;
}

export function Odontogram({
  dentition,
  teeth,
  selectedTooth,
  onSelectTooth,
  className,
}: OdontogramProps) {
  const quadrants =
    dentition === 'DECIDUOUS' ? DECIDUOUS_QUADRANTS : ADULT_QUADRANTS;

  const byCode = useMemo(() => {
    const m = new Map<string, ToothRenderState>();
    for (const t of teeth) {
      const surfaces: Partial<Record<ToothSurface, string>> = {};
      for (const s of t.surfaces ?? []) {
        surfaces[s.surface] = FINDING_FILL[s.finding];
      }
      m.set(t.toothCode, { status: t.status, surfaces });
    }
    return m;
  }, [teeth]);

  const upper = [...quadrants.upperRight, ...quadrants.upperLeft];
  const lower = [...quadrants.lowerRight.slice().reverse(), ...quadrants.lowerLeft.slice().reverse()];

  const rowWidth = upper.length * (TOOTH_W + GAP_X) - GAP_X;
  const totalHeight = TOOTH_H * 2 + ROW_GAP;

  return (
    <svg
      viewBox={`0 0 ${rowWidth} ${totalHeight}`}
      width="100%"
      role="img"
      aria-label="Odontogram"
      className={className}
    >
      <g transform="translate(0,0)">
        {renderRow(upper, byCode, selectedTooth, onSelectTooth)}
      </g>
      <g transform={`translate(0,${TOOTH_H + ROW_GAP})`}>
        {renderRow(lower, byCode, selectedTooth, onSelectTooth)}
      </g>
    </svg>
  );
}
