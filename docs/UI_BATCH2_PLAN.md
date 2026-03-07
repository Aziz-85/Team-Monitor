# UI Major Leap — Batch 2 Plan

## 1. Files to be modified

| File | Change |
|------|--------|
| **`components/ui/KpiCard.tsx`** | Add optional `trend?: string`; optional `trendSlot?: ReactNode`; consistent min-height (e.g. min-h for card). |
| **`components/ui/FilterBar.tsx`** | Add `quickPeriods?: { id: string; label: string }[]`, `onPeriodSelect?: (id: string) => void`, `summaryLine?: ReactNode`, `onReset?: () => void`. Render period chips row; summary line above or below controls; Reset button when onReset provided. |
| **`components/ui/Button.tsx`** | Variants: `primary` (accent), `secondary` (border/surface), `ghost` (transparent hover), `danger` (red). Remove inline style; use token classes only. |
| **`components/ui/Input.tsx`** | Use Tailwind token classes (border-border, bg-surface, text-foreground, focus:ring-accent); keep label/error; match inputBase height/radius. |
| **`components/ui/Select.tsx`** | **New.** Same pattern as Input: label, error, value, onChange, options, disabled; token classes; h-10 rounded-md border-border. |
| **`lib/ui-styles.ts`** | Add `btnGhost`; keep btnPrimary/Secondary/Danger aligned with Button. |
| **`app/(dashboard)/sales/summary/SalesSummaryClient.tsx`** | Use FilterBar with quickPeriods (Week, Month, Quarter, Custom), onPeriodSelect (set from/to), summaryLine "Viewing {boutique} • {from} → {to}", onReset; use Button and Select; optional Input for date if not using native. |

## 2. Component design

### KpiCard
- **Props:** label, value, note?, delta?, status?, **trend?**, **trendSlot?**
- **Layout:** Label (uppercase muted) → Value (2xl/3xl) → Note → Delta (status color) → Trend/trendSlot
- **Style:** Same card (rounded-lg border-border bg-surface p-5 shadow-card); add min-h-[7rem] or similar for consistency.

### FilterBar
- **New props:** quickPeriods[], onPeriodSelect(id), summaryLine (ReactNode), onReset (callback).
- **Layout:** 
  1. Optional summary line at top: "Viewing AlRashid • Jan 1 → Mar 7" (text-sm text-muted).
  2. Row 1: Period chips (Today, Week, Month, Quarter, Custom) + From/To inputs + Boutique select + Apply + Reset.
  3. Row 2 (existing): Active filter chips when activeFilters.length > 0.
- **Period chips:** Pill style; selected state (bg-surface-subtle border-accent or similar). Custom = show date inputs only (no preset).

### Button
- **Variants:** primary (bg-accent), secondary (border bg-surface), ghost (bg-transparent hover:bg-surface-subtle), danger (bg-red-600).
- **Base:** h-10 px-4 rounded-md font-medium text-sm; focus:ring-2 focus:ring-accent focus:ring-offset-2; disabled:opacity-50.

### Input
- **Unchanged API.** Replace style={{}} with className border-border bg-surface text-foreground; focus:ring-accent; rounded-md h-10.

### Select (new)
- **Props:** label?, error?, value, onChange, children (option elements) or options?: { value: string; label: string }[], disabled?, className?, id?
- **Markup:** Same wrapper as Input; <select> with token classes.

## 3. Diff preview

- **KpiCard:** Add trend + trendSlot after delta; add min-h to container.
- **FilterBar:** Add summaryLine at top; add first row with period chips (map quickPeriods to buttons), then children (from/to, boutique, Apply), then Reset if onReset; keep activeFilters row.
- **Button:** primary/secondary/ghost/danger classes; remove style prop.
- **Input:** className with border-border bg-surface text-foreground placeholder:text-muted focus:ring-accent rounded-md h-10; remove style.
- **Select.tsx:** New file; mirror Input structure with <select>.
- **ui-styles:** Add btnGhost = '... transparent hover:bg-surface-subtle'.
- **SalesSummaryClient:** Define period presets (last 7d, 30d, quarter); quickPeriods + onPeriodSelect; summaryLine = "Viewing {name} • {from} → {to}"; onReset sets from/to to default (e.g. last 30d) and refetch; use Button for Apply/Reset; use Select for boutique.
