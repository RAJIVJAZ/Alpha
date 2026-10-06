import { redirect } from 'next/navigation';
import { PLATFORM_ROLE_PERMISSIONS, type Permission } from '@foodgrid/auth/permissions';
import { getSession } from '@foodgrid/auth/next';
import type { PlatformRole } from '@foodgrid/types';

/** Permissions of the signed-in staff member (from their platform roles). */
export async function staffPermissions(): Promise<Permission[]> {
  const session = await getSession();
  if (!session) redirect('/login');
  return [
    ...new Set(
      (session.claims.roles as PlatformRole[]).flatMap((r) => PLATFORM_ROLE_PERMISSIONS[r] ?? []),
    ),
  ];
}

/** Sends staff without `permission` to their home page instead of a wall of 403s. */
export async function requirePermission(permission: Permission): Promise<void> {
  if (!(await staffPermissions()).includes(permission)) redirect('/');
}
