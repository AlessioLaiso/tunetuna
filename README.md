# Tunetuna  - Jellyfin Music PWA Client

A Jellyfin music client, built as a mobile-first self-hostable progressive web app.

| ![Album](https://github.com/user-attachments/assets/89096d83-37eb-4625-b3be-7eeeadf30786) | ![Home](https://github.com/user-attachments/assets/9be65469-5aff-4094-ae07-539a673e4c36) |
|:---:|:---:|
| Album screen, with a spinning disc when the album is playing. | Home screen, with smart mixes and recently added content. |



## Key Features

  - Browse your library by Artists, Albums, Songs, Genres, and Playlists. You can toggle these pages on and off.
  - Tunetuna Canned: your own listening stats synced across devices.
  - Home screen with recently added and recently played music. Top 10 chart provided by Apple Music and new releases from Muspy.com.
  - Create playlists from M3U files. Even if the file paths don't match, Tunetuna will match the songs by name and save the playlist to Jellyfin.
  - Search by name and filter by genre and year.
  - Queue management with optional recommendations for similar songs.
  - Background playback support, also on mobile.
  - Customizable accent color.
  - Artist and album pages with images and text info, when provided by the Jellyfin server.
  - Quick way to shuffle all songs by an artist or in a genre.
  - Genres displayed are the ones actually coming from the metadata in the songs. Genre data is stored locally for faster retrieval after the initial sync.
  - Song lyrics in the player and on-client voice removal from any song.
  - Works on mobile, desktop, and any device with a browser (your fridge?).

| ![Themes](https://github.com/user-attachments/assets/11185d97-157b-4c23-be57-9a9d826316b0) | ![Mobile](https://github.com/user-attachments/assets/b2a92765-3c05-4f0f-8419-706f888c8b9a) |
|:---:|:---:|
| Set any color you like in the appearance settings. | Tunetuna works great on mobile too. |

| ![Stats](https://github.com/user-attachments/assets/75f906cf-21dd-4d5d-8c18-8c2d5b5ad0a8) | ![Collection](https://github.com/user-attachments/assets/f07257c6-4109-43b0-a495-f6709e789bcd) |
|:---:|:---:|
| Get detailed listening stats and library insights any time of the year with Tunetuna ~~Wrapped~~ Canned. | Use the optional Discogs integration to keep track of your physical music collection. |

## Getting started (Docker)

1. From the project root, start the app with Docker Compose:

   ```bash
   docker compose up -d
   ```

   This builds the image and starts the container using the included `docker-compose.yml` file. By default, the app is exposed on `http://localhost:8080` (port 8080 on the host maps to port 80 in the container). If you want to change the port, edit the `ports` section in `docker-compose.yml` before running the command.

2. Open `http://localhost:8080` in your browser, or use the host and port you configured in the `ports` section if you changed it.

3. On first launch, enter your Jellyfin server URL and sign in with your Jellyfin credentials.

4. Enjoy!

5. If you want to add the app to your home screen:
   - On iOS: open Tunetuna in Safari, tap the Share button, then choose “Add to Home Screen”.
   - On Android: open Tunetuna in your browser and choose “Add to Home Screen” or “Install app”.

| ![Player](https://github.com/user-attachments/assets/84219fcf-2526-46f9-bdbb-34af7705621c) | ![Lyrics](https://github.com/user-attachments/assets/dde8e372-26f1-4d6f-88fb-991fd9fdeece) |
|:---:|:---:|
| A stunning player with powerful queue controls. | Follow along with synchronized lyrics and remove vocals with a lightweight local model. |

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

Third-party libraries and assets used in this project are provided under their own licenses, such as MIT or similar permissive licenses. All trademarks and copyrights for third party projects and assets are owned by their respective authors and maintainers.
