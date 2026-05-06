export interface Article {
  type: 'Article';
  title: string;
  description: string;
  author: {
    name: string;
    url: string;
  };
  publisher: {
    name: string;
    url: string;
  };
  datePublished: string;
  dateModified: string;
  image?: {
    url: string;
    width: number;
    height: number;
  };
  url: string;
  sameAs?: string[];
}