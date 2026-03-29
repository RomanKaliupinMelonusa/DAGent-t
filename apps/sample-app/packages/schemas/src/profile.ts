// =============================================================================
// User Profile Schemas
// =============================================================================
// GET /profile — returns the authenticated user's profile.
// PATCH /profile — updates display name and/or theme preference.
// =============================================================================

import { z } from "zod";

/**
 * Supported UI theme values.
 *
 * @example
 * ```json
 * "light"
 * ```
 */
export const ThemeSchema = z.enum(["light", "dark", "system"]);

export type Theme = z.infer<typeof ThemeSchema>;

/**
 * Full user profile returned by GET /profile.
 *
 * @example
 * ```json
 * {
 *   "id": "00000000-0000-0000-0000-000000000001",
 *   "displayName": "Demo User",
 *   "email": "demo@example.com",
 *   "theme": "system"
 * }
 * ```
 */
export const UserProfileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(2).max(50),
  email: z.string().email(),
  theme: ThemeSchema,
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

/**
 * Request body for PATCH /profile.
 *
 * @example
 * ```json
 * { "displayName": "New Name", "theme": "dark" }
 * ```
 */
export const ProfileUpdateSchema = z.object({
  displayName: z.string().min(2).max(50),
  theme: ThemeSchema,
});

export type ProfileUpdate = z.infer<typeof ProfileUpdateSchema>;
