import { createApp } from './app.js';

// Port 5000 is taken by AirPlay Receiver on recent macOS versions, so the
// default is 5001. Override with the PORT environment variable.
const PORT = process.env.PORT || 5001;

createApp().listen(PORT, () => {
  console.log(`[Smart SD-WAN Backend] Server running on http://localhost:${PORT}`);
});
