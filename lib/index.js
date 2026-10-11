/**
 * dsh-startup-animation — host half.
 *
 * The animation is entirely a browser-side concern: the client bundle
 * (./client/client.js) mounts its own overlay when the client loader
 * instantiates this plugin. The host half therefore registers nothing and
 * acquires no services; it exists only because a loader entry needs a valid
 * ESM Cordis plugin to resolve.
 *
 * Deliberately inert: no HTTP routes, no filesystem access, no settings, no
 * timers, no model-visible surface.
 */

export const name = 'startup-animation';

/** No-op: the browser half owns the whole feature. */
export function apply() {}
