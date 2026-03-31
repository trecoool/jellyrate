using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Mime;
using System.Threading.Tasks;
using Jellyfin.Plugin.Ratings.Configuration;
using Jellyfin.Plugin.Ratings.Data;
using Jellyfin.Plugin.Ratings.Models;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Ratings.Api;

[ApiController]
[Route("Ratings")]
[Produces(MediaTypeNames.Application.Json)]
public class RatingsController : ControllerBase
{
    private readonly RatingsRepository _repository;
    private readonly IUserManager _userManager;
    private readonly IAuthorizationContext _authContext;

    public RatingsController(
        RatingsRepository repository,
        IUserManager userManager,
        IAuthorizationContext authContext)
    {
        _repository = repository;
        _userManager = userManager;
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

        var userId = await GetUserIdAsync().ConfigureAwait(false);
        var result = await _repository.SetRatingAsync(userId, itemId, rating).ConfigureAwait(false);
        return Ok(result);
    }

    [HttpGet("Items/{itemId}/Stats")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<RatingStats>> GetStats([FromRoute] Guid itemId)
    {
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

        var stats = _repository.GetRatingStats(itemId, userId);
        return Ok(stats);
    }

    [HttpGet("Items/{itemId}/UserRating")]
    [Authorize]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<UserRating>> GetUserRating([FromRoute] Guid itemId)
    {
        var userId = await GetUserIdAsync().ConfigureAwait(false);
        var rating = _repository.GetUserRating(userId, itemId);
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
        var userId = await GetUserIdAsync().ConfigureAwait(false);
        var deleted = await _repository.DeleteRatingAsync(userId, itemId).ConfigureAwait(false);
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
        var ratings = _repository.GetItemRatings(itemId);
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

    [HttpGet("Config")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetConfig()
    {
        var config = Plugin.Instance?.Configuration ?? new PluginConfiguration();
        return Ok(new
        {
            config.EnableRatings,
            config.MinRating,
            config.MaxRating
        });
    }
}
