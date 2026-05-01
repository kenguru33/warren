# PWA icons

Source SVGs are committed alongside the rendered PNGs. To regenerate after a logo change:

```bash
cd ui/public/icons
rsvg-convert -w 192 -h 192 icon-source.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon-source.svg -o icon-512.png
rsvg-convert -w 192 -h 192 icon-source-maskable.svg -o icon-maskable-192.png
rsvg-convert -w 512 -h 512 icon-source-maskable.svg -o icon-maskable-512.png
rsvg-convert -w 180 -h 180 apple-touch-icon-source.svg -o apple-touch-icon.png
```

- `icon-source.svg` — rabbit at 80% scale, used for `purpose: "any"`.
- `icon-source-maskable.svg` — rabbit at 60% scale (sits inside Android's 80% safe zone), used for `purpose: "maskable"`.
- `apple-touch-icon-source.svg` — 180x180 opaque variant for iOS home screen.

All variants render the rabbit on an opaque `#18181b` background to match Warren's dark theme.
