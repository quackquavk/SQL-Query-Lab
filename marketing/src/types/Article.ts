// Shape of a schema.org Article JSON-LD node.
// Uses the real schema.org keys (@context/@type/headline) — NOT "type"/"title",
// which produce invalid JSON-LD that crawlers silently drop.
export interface Article {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;
  description: string;
  author: {
    '@type': 'Organization';
    name: string;
    url: string;
  };
  publisher: {
    '@type': 'Organization';
    name: string;
    url: string;
  };
  datePublished: string;
  dateModified: string;
  image?: {
    '@type': 'ImageObject';
    url: string;
    width: number;
    height: number;
  };
  url: string;
  speakable?: {
    '@type': 'SpeakableSpecification';
    cssSelector: string[];
  };
}
