// Shared with Terminal.tsx (owns the actual per-tab dock state) and
// defaultDock.ts (owns the default-dock preset preference) — split out so
// neither has to import the other just for this one type.
export type Dock = 'bottom' | 'right'
