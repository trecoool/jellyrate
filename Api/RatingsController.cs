using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mime;
using System.Threading.Tasks;
using JellyRate.Configuration;
using JellyRate.Data;
using JellyRate.Models;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace JellyRate.Api;

[ApiController]
[Route("Ratings")]
[Produces(MediaTypeNames.Application.Json)]
public class RatingsController : ControllerBase
{
    private readonly RatingsRepository _repository;
    private readonly ItemKeyResolver _keyResolver;
    private readonly IUserManager _userManager;
    private readonly ILibraryManager _libraryManager;
    private readonly IAuthorizationContext _authContext;

    public RatingsController(
        RatingsRepository repository,
        ItemKeyResolver keyResolver,
        IUserManager userManager,
        ILibraryManager libraryManager,
        IAuthorizationContext authContext)
    {
        _repository = repository;
        _keyResolver = keyResolver;
        _userManager = userManager;
        _libraryManager = libraryManager;
        _authContext = authContext;
    }

    private async Task<Guid> GetUserIdAsync()
    {
        var auth = await _authContext.GetAuthorizationInfo(HttpContext).ConfigureAwait(false);
        return auth.UserId;
    }

    [HttpPost("Items/{itemId}/Rating")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<UserRating>> SetRating(
        [FromRoute] Guid itemId,
        [FromQuery] int rating)
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        if (!config.EnableRatings)
        {
            return StatusCode(StatusCodes.Status403Forbidden, "Ratings are disabled");
        }

        if (rating < config.MinRating || rating > config.MaxRating)
        {
            return BadRequest($"Rating must be between {config.MinRating} and {config.MaxRating}");
        }

        var itemKey = _keyResolver.GetKey(itemId);
        if (itemKey == null)
        {
            return BadRequest("Only movies, series, episodes and persons can be rated");
        }

        var userId = await GetUserIdAsync().ConfigureAwait(false);
        var result = await _repository.SetRatingAsync(userId, itemKey, itemId, rating).ConfigureAwait(false);
        return Ok(result);
    }

    [HttpGet("Items/{itemId}/Stats")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RatingStats>> GetStats([FromRoute] Guid itemId)
    {
        // 404 tells the frontend the item is not ratable
        var itemKey = _keyResolver.GetKey(itemId);
        if (itemKey == null)
        {
            return NotFound();
        }

        Guid? userId = null;
        try
        {
            var auth = await _authContext.GetAuthorizationInfo(HttpContext).ConfigureAwait(false);
            if (auth.IsAuthenticated)
            {
                userId = auth.UserId;
            }
        }
        catch
        {
            // Not authenticated, that's fine
        }

        var stats = _repository.GetRatingStats(itemKey, itemId, userId);
        return Ok(stats);
    }

    [HttpGet("Items/{itemId}/UserRating")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<UserRating>> GetUserRating([FromRoute] Guid itemId)
    {
        var itemKey = _keyResolver.GetKey(itemId);
        var userId = await GetUserIdAsync().ConfigureAwait(false);
        var rating = itemKey == null ? null : _repository.GetUserRating(userId, itemKey);
        if (rating == null)
        {
            return NotFound();
        }

        return Ok(rating);
    }

    [HttpGet("Users/{userId}/Ratings")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<List<UserRating>> GetUserRatings([FromRoute] Guid userId)
    {
        var ratings = _repository.GetUserRatings(userId);
        return Ok(ratings);
    }

    [HttpGet("MyRatings")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<List<UserRating>>> GetMyRatings()
    {
        var userId = await GetUserIdAsync().ConfigureAwait(false);
        var ratings = _repository.GetUserRatings(userId);
        return Ok(ratings);
    }

    [HttpDelete("Items/{itemId}/Rating")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult> DeleteRating([FromRoute] Guid itemId)
    {
        var itemKey = _keyResolver.GetKey(itemId);
        if (itemKey == null)
        {
            return NotFound();
        }

        var userId = await GetUserIdAsync().ConfigureAwait(false);
        var deleted = await _repository.DeleteRatingAsync(userId, itemKey).ConfigureAwait(false);
        if (!deleted)
        {
            return NotFound();
        }

        return NoContent();
    }

    [HttpGet("Items/{itemId}/DetailedRatings")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<List<UserRatingDetail>> GetDetailedRatings([FromRoute] Guid itemId)
    {
        var itemKey = _keyResolver.GetKey(itemId);
        var ratings = itemKey == null ? new List<UserRating>() : _repository.GetItemRatings(itemKey);
        var details = ratings
            .Select(r =>
            {
                var user = _userManager.GetUserById(r.UserId);
                return new UserRatingDetail
                {
                    UserId = r.UserId,
                    Username = user?.Username ?? "Unknown",
                    Rating = r.Rating,
                    CreatedAt = r.CreatedAt
                };
            })
            .OrderByDescending(d => d.Rating)
            .ThenBy(d => d.Username)
            .ToList();

        return Ok(details);
    }

    [HttpGet("AllStats")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetAllStats()
    {
        var result = new Dictionary<string, object>();
        foreach (var (itemKey, stats) in _repository.GetAllItemStats())
        {
            if (_keyResolver.ResolveId(itemKey) is { } itemId)
            {
                result[itemId.ToString()] = new { stats.AverageRating, stats.TotalRatings };
            }
        }

        return Ok(result);
    }

    [HttpGet("RatedItems")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<List<RatedItemDto>> GetRatedItems([FromQuery] Guid? userId = null, [FromQuery] Guid? parentId = null)
    {
        var allStats = _repository.GetAllItemStats();

        // If filtering by user, only include items that user has rated
        HashSet<string>? userItemKeys = null;
        if (userId.HasValue)
        {
            userItemKeys = _repository.GetUserRatings(userId.Value)
                .Select(RatingsRepository.KeyOf)
                .ToHashSet();
        }

        var results = new List<RatedItemDto>();
        foreach (var (itemKey, stats) in allStats)
        {
            if (userItemKeys != null && !userItemKeys.Contains(itemKey))
                continue;

            if (_keyResolver.ResolveId(itemKey) is not { } itemId)
                continue;

            // The view lists movies and series only; persons and episodes are rated on their detail page
            var item = _libraryManager.GetItemById(itemId);
            if (item is not (Movie or Series))
                continue;

            // Filter by library — topParentId from URL may be a UserView or CollectionFolder
            if (parentId.HasValue)
            {
                var collectionFolders = _libraryManager.GetCollectionFolders(item);
                bool inLibrary = collectionFolders.Any(cf => cf.Id == parentId.Value);

                // If parentId is a UserView, resolve to its underlying CollectionFolder
                if (!inLibrary)
                {
                    var parentItem = _libraryManager.GetItemById(parentId.Value);
                    if (parentItem != null)
                    {
                        var parentCfs = _libraryManager.GetCollectionFolders(parentItem);
                        var parentCfIds = parentCfs.Select(cf => cf.Id).ToHashSet();
                        inLibrary = collectionFolders.Any(cf => parentCfIds.Contains(cf.Id));
                    }
                }

                if (!inLibrary)
                    continue;
            }

            var itemRatings = _repository.GetItemRatings(itemKey);
            var userRatings = itemRatings.Select(r =>
            {
                var user = _userManager.GetUserById(r.UserId);
                return new RatedItemUserRating
                {
                    UserId = r.UserId,
                    Username = user?.Username ?? "Unknown",
                    Rating = r.Rating
                };
            }).ToList();

            results.Add(new RatedItemDto
            {
                ItemId = itemId,
                Name = item.Name,
                ProductionYear = item.ProductionYear,
                Type = item.GetBaseItemKind().ToString(),
                HasPrimaryImage = item.HasImage(ImageType.Primary, 0),
                AverageRating = stats.AverageRating,
                TotalRatings = stats.TotalRatings,
                UserRatings = userRatings
            });
        }

        results.Sort((a, b) => b.AverageRating.CompareTo(a.AverageRating));
        return Ok(results);
    }

    [HttpGet("Config")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetConfig()
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return Ok(new
        {
            config.EnableRatings,
            config.MinRating,
            config.MaxRating,
            config.DisableUserRatedTab
        });
    }

    [HttpGet("jellyrate.js")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetScript()
    {
        // Shim for index pages cached with the old classic tag: loads the current module tree
        Response.Headers.CacheControl = "no-cache";
        var shim = $"import(new URL('web/{Plugin.CacheBustToken}/main.js', document.currentScript.src).href);";
        return Content(shim, "application/javascript");
    }

    // Token is only a cache key: any value serves the current modules
    [HttpGet("web/{token}/{file}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public ActionResult GetModule([FromRoute] string token, [FromRoute] string file)
    {
        var assembly = typeof(RatingsController).Assembly;
        var resourceName = "JellyRate.Web." + file;
        if (!file.EndsWith(".js", StringComparison.Ordinal)
            || !assembly.GetManifestResourceNames().Contains(resourceName))
        {
            return NotFound();
        }

        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return File(assembly.GetManifestResourceStream(resourceName)!, "application/javascript");
    }
}
