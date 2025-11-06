# TODO: Fix Render Deployment Issue

- [x] Edit package.json: Add "build": "tsc" script, change main to "dist/server.js", update start to "node dist/server.js"
- [x] Edit src/server.ts: Add res.json(resp) in /upload endpoint after upload call; remove duplicate privateKey declaration
- [x] Run npm run build locally to verify compilation
- [x] Advise on setting Render build command to "npm run build"
