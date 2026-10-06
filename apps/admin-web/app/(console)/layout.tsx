import { Shell } from './shell';
import { staffPermissions } from './access';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <Shell permissions={await staffPermissions()}>{children}</Shell>;
}
