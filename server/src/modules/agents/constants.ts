/** Constants for the agents module. */

/** Initial config version recorded for a newly-created agent. */
export const INITIAL_AGENT_VERSION = 1;

/** Default agent description when none is supplied on insert. */
export const DEFAULT_AGENT_DESCRIPTION = '';

/** Days of history the stats windows (runs_30d, accept rate, findings) cover. */
export const STATS_WINDOW_DAYS = 30;

/** Weekly buckets rendered in the Stats tab's findings-by-severity chart. */
export const STATS_SEVERITY_WEEKS = 5;

/** Most recent runs returned in a single agent's Stats → run history table. */
export const RUN_HISTORY_LIMIT = 20;
