export const EVENTS_MODULE_OPTIONS = Symbol('EVENTS_MODULE_OPTIONS');
export const DEAD_LETTER_STREAM = 'events:dlq';
/** Approximate cap per stream (XADD MAXLEN ~). */
export const STREAM_MAX_LEN = 200_000;
export const MAX_DELIVERIES = 5;
