# JellyRate

A Jellyfin plugin that lets users rate media items (1-10 stars) and view aggregate statistics.

This project is extracted and rewritten from [K3ntas/jellyfin-plugin-ratings](https://github.com/K3ntas/jellyfin-plugin-ratings), which bundles ratings, media requests, and several other features into a single monolithic plugin. JellyRate isolates the ratings functionality into a clean, standalone plugin with a focused codebase.

## Features

- Rate any media item (configurable scale, default 1-10)
- View aggregate stats: average rating, total count, distribution
- Per-user rating history
- Detailed ratings with usernames
- Admin configuration page

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

1. Build: `dotnet build -c Release`
2. Copy `Jellyfin.Plugin.Ratings.dll` to your Jellyfin plugins directory
3. Restart Jellyfin
