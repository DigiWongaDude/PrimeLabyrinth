# The Between — browser edition

A dependency-free browser port of the Prime Labyrinth isometric explorer. It
uses the same nine-key transitions, room fundamentals, doorway ordering,
elevations and deterministic crate stairs as `PrimeLabyrinth-PyramIDE.py`.

Open `dist/index.html` through a local web server, or run:

```powershell
node browser_game/serve.mjs
```

Then visit `http://127.0.0.1:4173`. Tap/click the floor to walk and a doorway to
travel. Progress is saved in the browser. **Copy path link** creates a URL that
reconstructs the same visit from `(2,2,3)` on another device.

Verification:

```powershell
node --test browser_game/test-engine.mjs
```

The edition is deliberately static: it has no server, account or package
dependencies and can be hosted from any ordinary web host.
