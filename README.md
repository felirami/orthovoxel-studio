# OrthoVoxel Studio

OrthoVoxel Studio is an open-source desktop pixel-art tool for reconstructing a voxel-like 3D model from orthographic pixel-art views, editing the model, and exporting directional sprite sheets.

This is a clean-room, original implementation. It does not include proprietary code, branding, art, or assets from any other application.

## Features

- Import front, side, top, back, left, and bottom image views.
- Rebuild a voxel volume from the imported orthographic silhouettes.
- Preview and edit the model in a Three.js viewport.
- Paint, add, erase, fill, select, and delete voxels.
- Save and load projects as JSON.
- Export snapshots and 8/16-direction sprite sheets.
- Package as a macOS Electron app.

## Development

```bash
npm install
npm run desktop
```

The web renderer runs at `http://127.0.0.1:5173/` during development.

## Build

```bash
npm run build
```

## Package for macOS

```bash
npm run dist:mac
```

Without an Apple Developer ID certificate, the generated macOS app is unsigned. macOS may warn when opening it. For local testing, right-click the app and choose Open.

## Verification

```bash
npm run build
node scripts/verify-ui.mjs
```

The verification script opens the app with Playwright, loads the demo model, checks that the WebGL canvas renders nonblank content, and captures desktop/mobile screenshots.

## License

MIT
