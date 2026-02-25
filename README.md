# Tunetuna  - Jellyfin Music PWA Client

A Jellyfin music client, built as a mobile-first self-hostable progressive web app.


https://github.com/user-attachments/assets/30e20d38-4566-4fba-b4c0-e4981b956e1b


<img width="1686" height="1912" alt="mobile and desktop screenshots of tunetuna" src="https://github.com/user-attachments/assets/0110e38a-84bc-4dd7-b4cb-4185213fa239" />


## Key Features

  - Browse your library by Artists, Albums, Songs, Genres, and Playlists. You can toggle these pages on and off.
  - Tunetuna Canned: your own listening stats synced across devices.
  - Home screen with recently added and recently played music.Top 10 chart provided by Apple Music and new releases from Muspy.com.
  - Create playlists from M3U files. Even if the file paths don't match, Tunetuna will match the songs by name and save the playlist to Jellyfin.
  - Search by name and filter by genre and year.
  - Queue management with optional recommendations for similar songs.
  - Background playback support, also on mobile.
  - Customizable accent color.
  - Artist and album pages with images and text info, when provided by the Jellyfin server.
  - Quick way to shuffle all songs by an artist or in a genre.
  - Genres displayed are the ones actually coming from the metadata in the songs. Genre data is stored locally for faster retrieval after the initial sync.
  - Song lyrics in the player.
  - Works on mobile, desktop, and any device with a browser (your fridge?).

## Getting started (Docker)

1. From the project root, start the app with Docker Compose:

   ```bash
   docker compose up -d
   ```

   This builds the image and starts the container using the included `docker-compose.yml` file. By default the app is exposed on `http://localhost:8080` (port 8080 on the host maps to port 80 in the container). If you want to change the port, edit the `ports` section in `docker-compose.yml` before running the command.

2. Open `http://localhost:8080` in your browser, or use the host and port you configured in the `ports` section if you changed it.

3. On first launch, enter your Jellyfin server URL and sign in with your Jellyfin credentials.

4. Enjoy!

5. If you want to add the app to your home screen:
   - On iOS: open Tunetuna in Safari, tap the Share button, then choose “Add to Home Screen”.
   - On Android: open Tunetuna in your browser, and choose “Add to Home Screen” or “Install app”.


## Tech stack and licensing

Tunetuna is licensed under the GNU General Public License version 3. See the `LICENSE` file for details.

This project uses:

- React 18 with TypeScript
- React Router
- Zustand for state management
- Tailwind CSS for styling
- Lucide React for icons
- Vite and related tooling
- HTML5 Audio API
- PWA support with a service worker

Third party libraries and assets used in this project are provided under their own licenses, such as MIT or similar permissive licenses. All trademarks and copyrights for third party projects and assets are owned by their respective authors and maintainers.
