# JellyRate

A Jellyfin plugin that lets users rate media items (1-10 stars) and view aggregate statistics.

This project is extracted and rewritten from [K3ntas/jellyfin-plugin-ratings](https://github.com/K3ntas/jellyfin-plugin-ratings) focusing solely on the rating system.

## Features

- Rate any media item (configurable scale, default 1-10)
- See other users' ratings on library items
- User ratings page : see library items ordered by ratings, aggregated or per user

## Screenshots

![Rating widget on the movie detail page](Screenshots/movie-page.png)

## Requirements

- Jellyfin 10.11.x
- .NET 9.0

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/Ratings/Items/{itemId}/Rating?rating=N` | Set or update your rating |
| GET | `/Ratings/Items/{itemId}/Stats` | Aggregate stats (optional auth) |
| GET | `/Ratings/Items/{itemId}/UserRating` | Your rating for an item |
| GET | `/Ratings/Items/{itemId}/DetailedRatings` | All ratings with usernames |
| GET | `/Ratings/Users/{userId}/Ratings` | All ratings by a user |
| GET | `/Ratings/MyRatings` | All your ratings |
| GET | `/Ratings/AllStats` | Stats for every rated item |
| GET | `/Ratings/RatedItems` | All items rated, with per-user breakdown |
| DELETE | `/Ratings/Items/{itemId}/Rating` | Delete your rating |
| GET | `/Ratings/Config` | Plugin configuration |

## Installation

Build from source and copy the DLL into Jellyfin's plugin folder:

```bash
dotnet build -c Release
```

Copy `bin/Release/net9.0/JellyRate.dll` to `<jellyfin-config>/plugins/JellyRate/`, then restart Jellyfin.
