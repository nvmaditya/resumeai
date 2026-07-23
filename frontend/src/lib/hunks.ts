/** Pure helpers for coach hunk selection + editor range marks. */

export type HunkLike = { find: string; replace: string }

export function filterSelectedHunks<T>(hunks: T[], selectedIndices: number[]): T[] {
  if (!hunks?.length) return []
  const set = new Set(selectedIndices.filter((i) => Number.isInteger(i) && i >= 0))
  return hunks.filter((_, i) => set.has(i))
}

export type HunkRange = { index: number; from: number; to: number; selected: boolean }

/** Locate first occurrence of each hunk find in doc for decoration marks. */
export function findHunkRanges(
  doc: string,
  hunks: HunkLike[],
  selectedIndices: number[],
): HunkRange[] {
  const selected = new Set(selectedIndices)
  const out: HunkRange[] = []
  for (let i = 0; i < hunks.length; i++) {
    const find = hunks[i]?.find ?? ''
    if (!find) continue
    const idx = doc.indexOf(find)
    if (idx < 0) continue
    out.push({
      index: i,
      from: idx,
      to: idx + find.length,
      selected: selected.has(i),
    })
  }
  return out
}

export function defaultSelectedIndices(hunkCount: number): number[] {
  return Array.from({ length: hunkCount }, (_, i) => i)
}
