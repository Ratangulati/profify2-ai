export {
  linearRegressionSlope,
  computeTrendLabel,
  getWeekStart,
  getWeekStarts,
  type DataPoint,
  type TrendLabel,
} from "./regression.js";

export {
  aggregateWeekly,
  fillMissingWeeks,
  type FeedbackForAggregation,
  type WeeklyAggregate,
} from "./aggregator.js";

export { checkSpike, detectSpikes, type SpikeCheckResult } from "./spike.js";
