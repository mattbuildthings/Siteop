import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import fs from 'fs';

function localApiPlugin() {
  return {
    name: 'local-api-handler',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const urlObj = new URL(req.url, 'http://localhost:5173');
        const routeName = urlObj.pathname.replace(/^\/api\//, '').split('/')[0];
        const apiFilePath = path.resolve(process.cwd(), `api/${routeName}.ts`);

        if (!fs.existsSync(apiFilePath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `API route /api/${routeName} not found` }));
          return;
        }

        try {
          // Collect request body
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
          }
          const rawBody = Buffer.concat(chunks).toString('utf8');
          let bodyData: any = {};
          if (rawBody) {
            try {
              bodyData = JSON.parse(rawBody);
            } catch {
              bodyData = rawBody;
            }
          }

          req.query = Object.fromEntries(urlObj.searchParams);
          req.body = bodyData;

          res.status = function (code: number) {
            res.statusCode = code;
            return res;
          };
          res.json = function (data: any) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };

          // Ensure env variables from .env / .env.local are populated into process.env
          const env = loadEnv(server.config.mode || 'development', process.cwd(), '');
          Object.assign(process.env, env);

          const mod = await server.ssrLoadModule(apiFilePath);
          const handler = mod.default || mod;
          await handler(req, res);
        } catch (err: any) {
          console.error(`[local-api] Error handling ${req.url}:`, err);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message || 'Internal error executing API route' }));
          }
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [
    localApiPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'Siteop - Site Operations Diary',
        short_name: 'Siteop',
        description: 'Nightly site operations diary & voice capture PWA',
        theme_color: '#faf9f4',
        background_color: '#faf9f4',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
