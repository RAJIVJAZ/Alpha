import { Shell } from './shell';
import { vendorKind } from './kind';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind={await vendorKind()}>{children}</Shell>;
}
