# Market Desk

Run `npm run open`. It starts the server, opens the dashboard, and stops the server after you close the dashboard tab. Keep the terminal open while using the site.

On Windows, double-click `Market Desk.vbs` to start it without showing a terminal window.

Use `npm start` only when you want to manage the server yourself, then open `http://localhost:3000` in a browser.

Do not open `public/index.html` directly: its ticker search needs the local Node server to call the Yahoo Finance prototype endpoint.
