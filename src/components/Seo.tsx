import { env } from '@/lib/env';

interface SeoProps {
  title: string;
  description?: string;
  path?: string;
  image?: string | null;
  noindex?: boolean;
}

/** React 19 hoists these tags into <head>. */
export function Seo({ title, description, path, image, noindex }: SeoProps) {
  const fullTitle = title.includes('Hire Me!') ? title : `${title} · Hire Me!`;
  const url = path ? `${env.appUrl}${path}` : undefined;
  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {url && <link rel="canonical" href={url} />}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </>
  );
}
