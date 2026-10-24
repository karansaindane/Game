# Quickdraw

A room-code multiplayer party game. The frontend is a static site on Vercel; the authoritative room/game API runs as a Node web service on Render.

## Deploy

1. Import this repository into Render as a Blueprint. Render reads `render.yaml` and creates the `quickdraw-api-karansaindane` free web service.
2. Wait until the Render service is live at `https://quickdraw-api-karansaindane.onrender.com/health`.
3. Import the same repository into Vercel. The Vercel project uses `public/` as its output directory and proxies `/api/*` to the Render service using `vercel.json`.

The frontend needs no build step and no environment variables. Both platforms should deploy from the `main` branch.

## Run locally

Requires Node.js 18 or newer.

```sh
npm start
```

Open `http://localhost:3000`.

## Free hosting notes

Render's free web services sleep after inactivity and can take about a minute to wake. Room state is currently held in server memory, so an unexpected restart or sleep cycle can end active rooms. The game does not store accounts or player answers after a room ends.
