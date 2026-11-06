/* Deployment settings. Leave wsUrl empty when the app and API share one origin (npm start, Docker, nginx).
 * On Netlify, set it to your backend's WebSocket address, e.g. "wss://edulearn-api.onrender.com/ws",
 * because Netlify redirects cannot proxy WebSockets. */
window.EDU_CONFIG = { wsUrl: '' };
