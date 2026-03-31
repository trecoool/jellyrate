# Jellyfin Ratings Plugin — Implementation Plan

## Overview

A **standalone** Jellyfin plugin that lets users rate media items (1–10 stars) and view aggregate statistics. Forked concept from [K3ntas/jellyfin-plugin-ratings](https://github.com/K3ntas/jellyfin-plugin-ratings), but rewritten from scratch with clean architecture.

**Reference repo quirks to avoid:**
- God-class repository (99KB) handling 15 data domains → we use one focused repository
- God-class controller (129KB) → we use one small controller
- Fire-and-forget saves `_ = SaveAsync()` inside lock blocks → we properly await saves
- `async` methods that never await → keep signatures honest
- Single `lock(_lock)` shared across unrelated data → not applicable here (single domain)

---

## Target Environment

- **.NET 9.0**
- **Jellyfin SDK 10.11.0** (`Jellyfin.Controller` + `Jellyfin.Model`)
- **Plugin GUID**: Generate a new one (do NOT reuse `a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d`)

---

## Project Structure

```
Jellyfin.Plugin.Ratings/
├── Jellyfin.Plugin.Ratings.csproj
├── Plugin.cs                          // Entry point, BasePlugin<PluginConfiguration>
├── PluginServiceRegistrator.cs        // DI registration
├── Configuration/
│   ├── PluginConfiguration.cs         // EnableRatings, MinRating, MaxRating
│   └── configPage.html               // Embedded config UI
├── Models/
│   ├── UserRating.cs                  // Persistent entity
│   ├── RatingStats.cs                 // Computed aggregate DTO
│   └── UserRatingDetail.cs            // Rating + resolved username DTO
├── Data/
│   └── RatingsRepository.cs           // JSON file storage + in-memory cache
└── Api/
    └── RatingsController.cs           // All rating endpoints
```

---

## Data Models

### UserRating (persistent entity)

```csharp
public class UserRating
{
    public Guid Id { get; set; }           // PK, auto-generated
    public Guid UserId { get; set; }
    public Guid ItemId { get; set; }
    public int Rating { get; set; }        // MinRating..MaxRating (default 1-10)
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
```

### RatingStats (computed, never stored)

```csharp
public class RatingStats
{
    public Guid ItemId { get; set; }
    public double AverageRating { get; set; }  // rounded to 2 decimals
    public int TotalRatings { get; set; }
    public int? UserRating { get; set; }       // current user's rating, if authenticated
    public int[] Distribution { get; set; }    // int[10]: index 0 = count of rating 1, etc.
}
```

### UserRatingDetail (read-only DTO)

```csharp
public class UserRatingDetail
{
    public Guid UserId { get; set; }
    public string Username { get; set; }
    public int Rating { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

---

## Storage

- **Directory**: `{JellyfinDataPath}/ratings/`
- **File**: `ratings.json` — JSON array of `UserRating`
- **Runtime**: `Dictionary<Guid, UserRating>` keyed by `UserRating.Id`
- **Concurrency**: `SemaphoreSlim(1,1)` for file writes. Use `lock` for in-memory reads/writes. **Properly await** saves — no fire-and-forget.
- **Serialization**: `System.Text.Json` with `WriteIndented = true`

### Repository Methods

| Method | Signature | Notes |
|--------|-----------|-------|
| SetRatingAsync | `Task<UserRating>(Guid userId, Guid itemId, int rating)` | Upsert: find by userId+itemId, update or create. Await save. |
| GetUserRating | `UserRating?(Guid userId, Guid itemId)` | Lookup by composite key. Returns null if none. |
| GetItemRatings | `List<UserRating>(Guid itemId)` | All ratings for one item. |
| GetUserRatings | `List<UserRating>(Guid userId)` | All ratings by one user, ordered by UpdatedAt desc. |
| GetRatingStats | `RatingStats(Guid itemId, Guid? userId)` | Compute average, total, distribution. Include user's own if userId provided. |
| DeleteRatingAsync | `Task<bool>(Guid userId, Guid itemId)` | Remove rating. Return false if not found. |

---

## API Endpoints

Base route: `[Route("Ratings")]`

| # | Method | Route | Auth | Params | Returns | Description |
|---|--------|-------|------|--------|---------|-------------|
| 1 | POST | `/Ratings/Items/{itemId}/Rating` | User | `itemId` (route), `rating` (query, int) | `UserRating` | Create or update rating. Validate range against config. |
| 2 | GET | `/Ratings/Items/{itemId}/Stats` | Optional | `itemId` (route) | `RatingStats` | Aggregate stats. Includes user's own rating if authenticated. |
| 3 | GET | `/Ratings/Items/{itemId}/UserRating` | User | `itemId` (route) | `UserRating` or 404 | Current user's rating for this item. |
| 4 | GET | `/Ratings/Users/{userId}/Ratings` | User | `userId` (route) | `List<UserRating>` | All ratings by a user. Default to self if no admin. |
| 5 | GET | `/Ratings/MyRatings` | User | — | `List<UserRating>` | Convenience: all ratings for authenticated user. |
| 6 | DELETE | `/Ratings/Items/{itemId}/Rating` | User | `itemId` (route) | 204 or 404 | Delete own rating. |
| 7 | GET | `/Ratings/Items/{itemId}/DetailedRatings` | Public | `itemId` (route) | `List<UserRatingDetail>` | All ratings with usernames. Ordered by rating desc, then username asc. |
| 8 | GET | `/Ratings/Config` | Public | — | `{ EnableRatings, MinRating, MaxRating }` | Client-facing config. |

### Authentication Pattern

Use `[Authorize]` attribute where possible. For optional auth (Stats endpoint), check `User.GetUserId()` and gracefully handle unauthenticated. Avoid the reference repo's manual header-parsing pattern — use Jellyfin's built-in auth middleware.

---

## Configuration

### PluginConfiguration.cs

```csharp
public class PluginConfiguration : BasePluginConfiguration
{
    public bool EnableRatings { get; set; } = true;
    public int MinRating { get; set; } = 1;
    public int MaxRating { get; set; } = 10;
}
```

### configPage.html

Embedded resource. Simple form with 3 fields:
- Toggle: Enable Ratings
- Number input: Min Rating (default 1)
- Number input: Max Rating (default 10)

Use Jellyfin's standard plugin config page patterns (`Dashboard.getPluginConfiguration`, `Dashboard.savePluginConfiguration`).

---

## Plugin.cs

```csharp
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public static Plugin? Instance { get; private set; }
    public override string Name => "Ratings";
    public override Guid Id => Guid.Parse("GENERATE-NEW-GUID-HERE");

    // Constructor: set Instance = this
    // GetPages(): return configPage.html as EmbeddedResourcePage
}
```

---

## PluginServiceRegistrator.cs

```csharp
public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost appHost)
    {
        services.AddSingleton<RatingsRepository>();
    }
}
```

That's it. No middleware, no hosted services. Just the repository.

---

## Frontend (Optional / Phase 2)

The reference plugin injects a 1MB JS blob via middleware. For a clean plugin, consider:

**Option A (recommended):** No frontend in the plugin at all. Expose only the API and let users build a client-side script or browser extension if they want a UI overlay. The API is the product.

**Option B:** A minimal JS file that adds a star widget to item detail pages. If implementing:
- Keep it under 500 lines
- Use Jellyfin's `ApiClient` for requests
- Inject via `IHasWebPages` as a client-side script
- No middleware injection needed

---

## Implementation Checklist

1. [ ] Create `.csproj` with net9.0 target, Jellyfin.Controller + Jellyfin.Model 10.11.0
2. [ ] Create `Plugin.cs` entry point (generate fresh GUID)
3. [ ] Create `PluginConfiguration.cs` with 3 properties
4. [ ] Create `configPage.html` embedded resource
5. [ ] Create 3 model classes (`UserRating`, `RatingStats`, `UserRatingDetail`)
6. [ ] Create `RatingsRepository` with JSON storage + in-memory cache
7. [ ] Create `RatingsController` with 8 endpoints
8. [ ] Create `PluginServiceRegistrator` registering the repository
9. [ ] Test: build, drop DLL into Jellyfin plugins folder, verify endpoints via curl
