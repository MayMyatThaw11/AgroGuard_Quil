import React from 'react';
import { GLYPHS } from '../../lib/farmmap/farmMapGlyphs.ts';
import type { GlyphName } from '../../lib/farmmap/farmMapTypes.ts';

interface GlyphProps {
  name: GlyphName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const Glyph: React.FC<GlyphProps> = ({ name, size = 14, color, strokeWidth }) => {
  const Icon = GLYPHS[name];
  return <Icon size={size} color={color} strokeWidth={strokeWidth} aria-hidden="true" />;
};
