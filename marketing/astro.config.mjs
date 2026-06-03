// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Required so canonical/url in JSON-LD resolve to the production origin
  // instead of leaking http://localhost:4321 into the build output.
  site: 'https://learn-sql-practice.vercel.app',
});
