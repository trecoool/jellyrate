# JellyRate

A Jellyfin plugin that lets users rate media items (1-10 stars) and view aggregate statistics.

This project is extracted and rewritten from [K3ntas/jellyfin-plugin-ratings](https://github.com/K3ntas/jellyfin-plugin-ratings) focusing solely on the rating system.

## Features

- Rate any media item (configurable scale, default 1-10)
- See other users' ratings on library items
- User ratings page : see library items ordered by ratings, aggregated or per user

## Screenshots

![Rating widget on the movie detail page](screenshots/movie-page.png)

## Requirements

- Jellyfin 10.11.x
- .NET 9.0

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/Ratings/Items/{itemId}/Rating?rating=N` | Set or update your rating |
| GET | `/Ratings/Items/{itemId}/Stats` | Aggregate stats (optional auth) |
| GET | `/Ratings/Items/{itemId}/UserRating` | Your rating for an item |
| GET | `/Ratings/Users/{userId}/Ratings` | All ratings by a user |
| GET | `/Ratings/MyRatings` | All your ratings |
| DELETE | `/Ratings/Items/{itemId}/Rating` | Delete your rating |
| GET | `/Ratings/Items/{itemId}/DetailedRatings` | All ratings with usernames |
| GET | `/Ratings/Config` | Plugin configuration |

## Installation

### Via plugin repository (recommended)

1. In Jellyfin, go to **Dashboard → Plugins → Repositories**.
2. Click **+** and add:
   - **Name**: `JellyRate`
   - **URL**: `https://raw.githubusercontent.com/trecoool/jellyrate/master/manifest.json`
3. Open the **Catalog** tab, find **JellyRate**, and install it.
4. Restart Jellyfin.

### Manual install

1. Download the latest `JellyRate.zip` from the [Releases](https://github.com/trecoool/jellyrate/releases) page.
2. Extract `JellyRate.dll` to `<jellyfin-config>/plugins/JellyRate/`.
3. Restart Jellyfin.
