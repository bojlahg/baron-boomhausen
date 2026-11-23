# Baron Boomhausen

Ride a cannonball to the Moon in a slapstick physics game inspired by the tall tales of Baron Münchhausen. Arrange powder charges, hit **BOOM!**, and collect balloon gifts to unlock stronger charges, a mortar, and a cannon. Chase your own records for height, distance, and ducks knocked down in a single flight.

Baron Boomhausen is an HTML5 browser game made for itch.io. It uses TypeScript, Vite, and Canvas 2D.

## How to play

- Drag the Baron and place charges inside the launch zone. Drag a placed charge back to the inventory to remove it.
- Press **BOOM!** to launch. The dotted trail from your last flight helps you adjust your next shot.
- Steer your setup toward balloon gifts. Once you unlock **Wig Boost!**, you can pull yourself higher once per flight.
- Drag the background to pan, use the minimap to jump around, or zoom with the buttons by the map.

The game supports mouse and touch. Records, unlocks, and the last launch setup are saved in your browser.

## Run locally

Use Node.js 20.19 or later on the 20.x line, or Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

On Windows, `run-dev.cmd` starts Vite and opens the debug view. `build-dev.cmd` builds the debug version and sound preview page into `dist/`.

## Build for itch.io

Run `build-release.cmd` on Windows. It checks types and creates `baron-boomhausen.zip` with `index.html` at the archive root. Upload that ZIP to itch.io as the browser build.
