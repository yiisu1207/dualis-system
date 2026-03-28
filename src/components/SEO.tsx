import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title?: string;
  description?: string;
  url?: string;
  image?: string;
  type?: string;
  jsonLd?: object | object[];
  noindex?: boolean;
}

const BASE_URL = 'https://dualis.online';
const DEFAULT_IMAGE = `${BASE_URL}/logo.png`;
const DEFAULT_TITLE = 'Dualis ERP — El sistema que Venezuela necesitaba';
const DEFAULT_DESC =
  'ERP Cloud para Venezuela. POS Detal + Mayor, inventario, CxC, CxP, RRHH, contabilidad, tasas BCV en vivo e IA. En USD y bolívares. 30 días gratis.';

export default function SEO({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESC,
  url = BASE_URL,
  image = DEFAULT_IMAGE,
  type = 'website',
  jsonLd,
  noindex = false,
}: SEOProps) {
  const schemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      <link rel="canonical" href={url} />

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content={type} />

      {/* Twitter */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD */}
      {schemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
