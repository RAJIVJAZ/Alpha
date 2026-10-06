import { CmsPageView } from '@foodgrid/ui/customer';

export default async function CmsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CmsPageView slug={slug} />;
}
