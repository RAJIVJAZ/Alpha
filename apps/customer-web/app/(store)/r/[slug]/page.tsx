import type { Metadata } from 'next';
import { OutletView } from '@foodgrid/ui/customer';

type Props = { params: Promise<{ slug: string }> };

/** Title and description from the public outlet API, for sharing and search engines. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(
      `${process.env.API_URL ?? 'http://localhost:8080/api/v1'}/outlets/${encodeURIComponent(slug)}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return { title: 'Restaurant' };
    const o = (await res.json()) as {
      name: string;
      cuisines: string[];
      city: string;
      coverImageUrl: string | null;
    };
    return {
      title: o.name,
      description: `Order ${o.cuisines.join(', ')} from ${o.name}, ${o.city}, on FoodGrid.`,
      openGraph: o.coverImageUrl ? { images: [o.coverImageUrl] } : undefined,
    };
  } catch {
    return { title: 'Restaurant' };
  }
}

export default async function OutletPage({ params }: Props) {
  const { slug } = await params;
  return <OutletView slug={slug} />;
}
