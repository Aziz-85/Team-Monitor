/**
 * Design tokens — Light Corporate Luxury theme.
 * For use in Tailwind config, CSS variables, and component defaults.
 * No glass blur overload; no neon; minimal gold accents.
 */

export const designTokens = {
  colors: {
    background: '#F8F8F6',
    surface: '#FFFFFF',
    primary: '#1E1E1E',
    accent: '#C6A75E',
    success: '#4A7C59',
    error: '#B85450',
    border: '#E8E6E3',
    muted: '#6B7280',
    text: '#1E1E1E',
  },
  radius: {
    card: '12px',
    button: '8px',
    input: '8px',
  },
  shadow: {
    card: '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
    cardHover: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
  },
  spacing: {
    cardPadding: '1.25rem',
    sectionGap: '1.5rem',
  },
  typography: {
    fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, "Inter", sans-serif',
    headerWeight: '500',
  },
  /**
   * Focus: CSS uses --accent + --background offset (see globals.css :focus-visible).
   * Components use matching Tailwind: focus-visible:ring-accent ring-offset-background.
   */
  focus: {
    ringColor: 'var(--accent)',
    ringOffset: 'var(--background)',
  },
} as const;

export type DesignTokens = typeof designTokens;
