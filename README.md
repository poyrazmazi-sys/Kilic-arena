# Kılıç Arena

Online sword duels in an Ottoman arena, playable in the browser on PC, iPad and with a controller.

- Host a duel to get a four-letter code; a friend opens the same link, types the code and presses Fight.
- Anyone else with the code can watch from the stands or through the drone camera.
- Fight the bot at three difficulty levels.

Multiplayer is player to player (WebRTC through the free PeerJS service), so the site needs no game server.

## Develop

```
npm install
npm run arena          # dev server
npm run build:arena    # production build in dist-arena/
```

The earlier first-person prototype, Janissary: 1453, lives in `src/` and `index.html` (`npm run dev`).
