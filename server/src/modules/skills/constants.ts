/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill description when none is supplied on insert. */
export const DEFAULT_SKILL_DESCRIPTION = '';

/** Max decoded size accepted by `/skills/import` (.md or .zip). */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
