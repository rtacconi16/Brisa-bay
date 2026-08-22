/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare module '*.html?raw' {
  const html: string;
  export default html;
}

declare module '../../stores.json' {
  const doc: {
    stores: Array<{
      id: string;
      name: string;
      type: string;
      address: string;
      city: string;
      lat: number;
      lng: number;
      phone?: string;
      url?: string;
    }>;
  };
  export default doc;
}
