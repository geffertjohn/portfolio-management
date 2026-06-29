/**
 * Shared utility functions used across lib and hooks.
 */

/** Returns true for a positive finite integer — used to gate React Query fetches. */
export function isValidId(id: number): boolean {
  return Number.isInteger(id) && !Number.isNaN(id) && id > 0
}
