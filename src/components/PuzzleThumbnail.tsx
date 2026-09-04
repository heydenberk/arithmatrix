/**
 * PuzzleThumbnail Component
 *
 * Renders a puzzle's cage layout as a compact SVG preview: hairlines for every
 * cell edge, a heavier outline around each cage, and each cage's target in its
 * top-left cell — the same information the real grid shows, minus the colors.
 *
 * Drawn as SVG rather than DOM cells deliberately. A filtered gallery page can
 * hold a couple of hundred thumbnails, and one <div> per cell would run to five
 * figures of nodes. Here every cage boundary in a puzzle collapses into a single
 * <path>, so a 7x7 preview costs roughly a dozen nodes instead of fifty.
 */

import React, { useMemo } from 'react';
import { CatalogCage } from '../utils/puzzleCatalog';

interface PuzzleThumbnailProps {
  size: number;
  cages: CatalogCage[];
  /** Rendered width; defaults to filling the container. Stays square. */
  width?: number | string;
}

/** Formats a cage target the way the live grid does (see getCageInfo). */
const cageLabel = (cage: CatalogCage): string => {
  if (cage.operation === '=') return cage.value.toString();
  const op = cage.operation === '*' ? '×' : cage.operation === '/' ? '÷' : cage.operation;
  return `${cage.value}${op}`;
};

/**
 * Builds the SVG geometry once per puzzle: an outline path per cage boundary
 * and a label anchored in each cage's top-left cell.
 */
const buildGeometry = (size: number, cages: CatalogCage[]) => {
  // cellIndex -> which cage owns it, so boundary tests are O(1)
  const owner = new Map<number, number>();
  cages.forEach((cage, cageIndex) => {
    for (const cell of cage.cells) owner.set(cell, cageIndex);
  });

  // One path covering every edge where two different cages meet, plus the
  // outer border of the grid.
  const segments: string[] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cellIndex = row * size + col;
      const cage = owner.get(cellIndex);

      const differs = (nRow: number, nCol: number): boolean => {
        if (nRow < 0 || nRow >= size || nCol < 0 || nCol >= size) return true;
        return owner.get(nRow * size + nCol) !== cage;
      };

      if (differs(row - 1, col)) segments.push(`M${col} ${row}h1`);
      if (differs(row, col - 1)) segments.push(`M${col} ${row}v1`);
      // Only the far edges need drawing from this side; shared interior edges
      // are already covered by the neighbour's top/left test.
      if (row === size - 1) segments.push(`M${col} ${row + 1}h1`);
      if (col === size - 1) segments.push(`M${col + 1} ${row}v1`);
    }
  }

  const labels = cages.map(cage => {
    const topLeft = Math.min(...cage.cells);
    return {
      key: topLeft,
      row: Math.floor(topLeft / size),
      col: topLeft % size,
      text: cageLabel(cage),
    };
  });

  return { cagePath: segments.join(''), labels };
};

const PuzzleThumbnail: React.FC<PuzzleThumbnailProps> = ({ size, cages, width = '100%' }) => {
  const { cagePath, labels } = useMemo(() => buildGeometry(size, cages), [size, cages]);

  // Everything is drawn in cell units and scaled by the viewBox, so stroke
  // widths and font sizes are expressed as fractions of a cell.
  const hairline = 0.018;
  const cageLine = 0.09;
  const fontSize = Math.min(0.5, 2.6 / size);

  const interior = [];
  for (let i = 1; i < size; i++) {
    interior.push(`M${i} 0v${size}`, `M0 ${i}h${size}`);
  }

  return (
    <svg
      viewBox={`${-cageLine / 2} ${-cageLine / 2} ${size + cageLine} ${size + cageLine}`}
      role="img"
      aria-label={`${size}×${size} puzzle preview`}
      style={{
        display: 'block',
        width,
        // Square, driven by the viewBox, so it scales with the tile
        aspectRatio: '1 / 1',
        height: 'auto',
        borderRadius: 4,
        background: '#ffffff',
      }}
    >
      {/* Cell hairlines */}
      <path d={interior.join('')} stroke="#eef2f7" strokeWidth={hairline} fill="none" />
      {/* Cage outlines */}
      <path
        d={cagePath}
        stroke="#475569"
        strokeWidth={cageLine}
        strokeLinecap="square"
        fill="none"
      />
      {/* Cage targets, tucked into the top-left cell of each cage */}
      {labels.map(label => (
        <text
          key={label.key}
          x={label.col + 0.14}
          y={label.row + 0.14}
          fontSize={fontSize}
          fontWeight={700}
          fill="#1e293b"
          dominantBaseline="hanging"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
};

export default React.memo(PuzzleThumbnail);
