# tobanwiebe.com

Static personal site built with [Astro](https://astro.build/) and deployed to GitHub Pages.

## Local development

```sh
npm install
npm run dev
```

The development server runs at `http://localhost:4321` by default.

## Checks

```sh
npm run check
npm run build
```

## Content

- Long-form essays live in `src/content/writing`.
- Short-form posts and legacy blog entries live in `src/content/bits`.
- Projects live in `src/content/projects`.
- Bits preserve their original `/blog/YYYY/MM/slug/` URLs with a `permalink` field and are indexed at `/bits/`.
- If a bit has a newer essay version, set `latestVersion` to render a note linking to the essay.
- Future interactive visualizations should live in `src/components/viz` and mount as Astro React islands only where interactivity is needed.

## Deployment

Pushes to `main` run `.github/workflows/deploy.yml`, build the static Astro output, and publish it with GitHub Pages. The custom domain is preserved by `public/CNAME`.
