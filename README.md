# Quickdraw

A room-code multiplayer party game. Render serves the frontend and the authoritative room/game API from the same Node web service.

## Deploy

1. Import this repository into Render as a Blueprint. Render reads `render.yaml` and creates the `quickdraw-api-karansaindane` free web service.
2. When the service is live, open its `.onrender.com` URL. The same service serves the frontend and `/api/*` game routes.

The frontend needs no build step or environment variables. Render deploys from the `main` branch.

## Run locally

Requires Node.js 18 or newer.

```sh
npm start
```

Open `http://localhost:3000`.

## Free hosting notes

Render's free web services sleep after inactivity and can take about a minute to wake. Room state is currently held in server memory, so an unexpected restart or sleep cycle can end active rooms. The game does not store accounts or player answers after a room ends.
