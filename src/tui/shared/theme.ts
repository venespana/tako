// theme.ts — Design tokens for the TUI layer.
// Cursor glyph and colors are the only theming surface per the spec.

export const theme = {
  /** Cursor glyph shown on the focused menu item */
  cursorGlyph: '❯',
  /** Ink color name for the focused cursor glyph */
  cursorColor: 'cyan' as const,
  /** Ink color name for disabled/greyed items */
  disabledColor: 'gray' as const,
} as const;

export type Theme = typeof theme;
