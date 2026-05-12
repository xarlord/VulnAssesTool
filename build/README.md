# VulnAssessTool - Build Resources

This directory contains build resources for packaging the Electron application.

## Icons

Place your application icons here:

- **Windows:** `icon.ico` (256x256 minimum)
- **macOS:** `icon.icns` (1024x1024 minimum)
- **Linux:** `icon.png` (512x512 minimum, PNG with transparency)

## Generating Icons

You can generate icons from a high-resolution PNG (1024x1024 or higher) using tools like:

1. **png2ico** for Windows: https://png2ico.com/
2. **iconutil** (macOS built-in): `iconutil -c icns icon.iconset`
3. **ImageMagick**: `convert icon.png -define icon:auto-resize=256,128,64,32,16 app.ico`

## Quick Start (Development)

For development, the app will run without icons. For production builds,
you should add proper icon files.

## Resources

- Electron icon documentation: https://www.electronjs.org/docs/latest/tutorial/icon
- electron-builder configuration: https://www.electron.build/icon
