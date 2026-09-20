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
 * They lie on top of the board's edge rather than in a reserved strip beside
 * it. The strip cost the board 28px of width on a phone at all times, for
 * something on screen only during a hint, and it was the one thing keeping the
 * board off the edges of the screen. Overlaying costs nothing and still never
 * resizes anything. Each label carries its own chip so it reads against any
 * cage colour, and sits at the centre of its track, clear of the cage targets
 * in the cells' top-left corners.
 */

import React from 'react';
import { Box } from '@mantine/core';

interface GridAxisLabelsProps {
  size: number;
  cellSize: number;
  cellHeight: number;
  /** The hairline between cells, so labels line up with the tracks. */
  gap: number;
  visible: boolean;
}

const GridAxisLabels: React.FC<GridAxisLabelsProps> = ({
  size,
  cellSize,
  cellHeight,
  gap,
  visible,
}) => {
  const track: React.CSSProperties = {
    position: 'absolute',
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
    zIndex: 20,
    opacity: visible ? 1 : 0,
    transition: 'opacity 160ms ease',
    pointerEvents: 'none',
  };

  const chip: React.CSSProperties = {
    background: 'rgba(15, 23, 42, 0.74)',
    color: '#fff',
    borderRadius: 4,
    padding: '0 4px',
    fontSize: Math.max(9, Math.min(12, Math.round(Math.min(cellSize, cellHeight) * 0.22))),
    fontWeight: 700,
    lineHeight: 1.45,
  };

  return (
    <>
      <Box
        aria-hidden
        style={{
          ...track,
          top: 2,
          left: 0,
          gridTemplateColumns: `repeat(${size}, ${cellSize}px)`,
          columnGap: gap,
        }}
      >
        {Array.from({ length: size }, (_, i) => (
          <span key={i} style={chip}>
            {String.fromCharCode('A'.charCodeAt(0) + i)}
          </span>
        ))}
      </Box>
      <Box
        aria-hidden
        style={{
          ...track,
          top: 0,
          left: 2,
          gridTemplateRows: `repeat(${size}, ${cellHeight}px)`,
          rowGap: gap,
        }}
      >
        {Array.from({ length: size }, (_, i) => (
          <span key={i} style={chip}>
            {i + 1}
          </span>
        ))}
      </Box>
    </>
  );
};

export default GridAxisLabels;
