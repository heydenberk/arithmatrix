/**
 * GridAxisLabels
 *
 * A-G across the top and 1-7 down the left, shown only while a hint is open.
 *
 * Hints name cells by coordinate ("F7") but the board carries no coordinates,
 * so the player was left counting squares and guessing which axis the letter
 * belonged to. These make the mapping obvious, and disappear again afterwards:
 * they are scaffolding for the hint, not part of the puzzle.
 *
 * The gutter they sit in is reserved whether or not they are showing, so
 * opening a hint never resizes the board underneath it.
 */

import React from 'react';
import { Box } from '@mantine/core';

interface GridAxisLabelsProps {
  size: number;
  cellSize: number;
  cellHeight: number;
  /** The hairline between cells, so labels line up with the tracks. */
  gap: number;
  /** Width of the reserved strip on each axis. */
  gutter: number;
  visible: boolean;
}

const GridAxisLabels: React.FC<GridAxisLabelsProps> = ({
  size,
  cellSize,
  cellHeight,
  gap,
  gutter,
  visible,
}) => {
  const shared: React.CSSProperties = {
    position: 'absolute',
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
    // Reads against both the bare gradient on mobile and the glass panel on desktop
    color: 'rgba(255, 255, 255, 0.92)',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.28)',
    fontSize: Math.max(9, Math.min(13, Math.round(gutter * 0.72))),
    fontWeight: 700,
    lineHeight: 1,
    opacity: visible ? 1 : 0,
    transition: 'opacity 160ms ease',
    pointerEvents: 'none',
  };

  return (
    <>
      <Box
        aria-hidden
        style={{
          ...shared,
          top: 0,
          left: gutter,
          height: gutter,
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          columnGap: gap,
        }}
      >
        {Array.from({ length: size }, (_, i) => (
          <span key={i}>{String.fromCharCode('A'.charCodeAt(0) + i)}</span>
        ))}
      </Box>
      <Box
        aria-hidden
        style={{
          ...shared,
          top: gutter,
          left: 0,
          width: gutter,
          gridTemplateRows: `repeat(${size}, ${cellHeight}px)`,
          rowGap: gap,
        }}
      >
        {Array.from({ length: size }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </Box>
    </>
  );
};

export default GridAxisLabels;
