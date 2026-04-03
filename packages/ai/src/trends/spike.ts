/**
 * Spike detection: identifies when a theme or insight's volume
 * exceeds 3× the rolling average over the previous N weeks.
 */

export interface SpikeCheckResult {
  entityType: string;
  entityId: string;
  entityTitle: string;
  isSpike: boolean;
  currentVolume: number;
  rollingAverage: number;
  spikeFactor: number;
}

const DEFAULT_ROLLING_WEEKS = 4;
const DEFAULT_SPIKE_THRESHOLD = 3.0;

/**
 * Check if the current volume constitutes a spike relative to
 * the rolling average of previous periods.
 */
export function checkSpike(
  currentVolume: number,
  previousVolumes: number[],
  threshold: number = DEFAULT_SPIKE_THRESHOLD,
): { isSpike: boolean; rollingAverage: number; spikeFactor: number } {
  if (previousVolumes.length === 0) {
    return { isSpike: false, rollingAverage: 0, spikeFactor: 0 };
  }

  const rollingAverage = previousVolumes.reduce((sum, v) => sum + v, 0) / previousVolumes.length;

  if (rollingAverage === 0) {
    // If previous average is 0 and current > 0, that's a spike
    return {
      isSpike: currentVolume > 0,
      rollingAverage: 0,
      spikeFactor: currentVolume > 0 ? Infinity : 0,
    };
  }

  const spikeFactor = currentVolume / rollingAverage;

  return {
    isSpike: spikeFactor >= threshold,
    rollingAverage,
    spikeFactor,
  };
}

/**
 * Run spike detection across multiple entities.
 * Takes a map of entityId → array of weekly volumes (oldest first).
 * The last element in each array is the "current" week.
 */
export function detectSpikes(
  entities: Array<{
    entityType: string;
    entityId: string;
    entityTitle: string;
    weeklyVolumes: number[];
  }>,
  rollingWeeks: number = DEFAULT_ROLLING_WEEKS,
  threshold: number = DEFAULT_SPIKE_THRESHOLD,
): SpikeCheckResult[] {
  const results: SpikeCheckResult[] = [];

  for (const entity of entities) {
    const { weeklyVolumes } = entity;
    if (weeklyVolumes.length < 2) continue;

    const currentVolume = weeklyVolumes[weeklyVolumes.length - 1];
    // Use up to `rollingWeeks` previous values (excluding current)
    const previousStart = Math.max(0, weeklyVolumes.length - 1 - rollingWeeks);
    const previousVolumes = weeklyVolumes.slice(previousStart, weeklyVolumes.length - 1);

    const { isSpike, rollingAverage, spikeFactor } = checkSpike(
      currentVolume,
      previousVolumes,
      threshold,
    );

    results.push({
      entityType: entity.entityType,
      entityId: entity.entityId,
      entityTitle: entity.entityTitle,
      isSpike,
      currentVolume,
      rollingAverage,
      spikeFactor,
    });
  }

  return results;
}
