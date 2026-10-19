import { sellerKind } from './kind';
import { Shell } from './shell';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Shell kind={await sellerKind()}>{children}</Shell>;
}
