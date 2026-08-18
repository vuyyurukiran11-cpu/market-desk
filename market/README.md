# Market Desk

On Windows, run `npm run open`. It starts the server, opens the dashboard, and stops the server after you close the dashboard tab. Keep the terminal open while using the site. This command is Windows-only.

On Windows, double-click `Market Desk.vbs` to start it without showing a terminal window.

Use `npm start` only when you want to manage the server yourself, then open `http://localhost:3000` in a browser.

Do not open `public/index.html` directly: its ticker search needs the local Node server to call the Yahoo Finance prototype endpoint.

Project layout:

- `src/` — Node server and market-data modules
- `public/` — browser application assets
- `test/` — Node unit/API tests
- `../e2e_tests/` — standalone Playwright test repository (at repo root)
