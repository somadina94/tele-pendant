export type OperatorLayoutLike = {
  cells: Array<{
    feedbackRegister?: unknown | null;
    statusRegister?: unknown | null;
  }>;
  overlays?: Array<{ register?: unknown | null }>;
};

/** True when the UI shows live register values that need a tag snapshot. */
export function operatorNeedsLiveTags(
  layout: OperatorLayoutLike | null | undefined,
): boolean {
  if (!layout) return false;
  if ((layout.overlays?.length ?? 0) > 0) return true;
  return layout.cells.some((c) => c.feedbackRegister || c.statusRegister);
}

export function isOperatorScreenReady(args: {
  layoutLoaded: boolean;
  gridReady: boolean;
  needsLive: boolean;
  hasTags: boolean;
  liveFallback: boolean;
}): boolean {
  if (!args.layoutLoaded || !args.gridReady) return false;
  if (!args.needsLive) return true;
  return args.hasTags || args.liveFallback;
}
