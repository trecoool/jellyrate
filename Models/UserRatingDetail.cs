using System;

namespace Jellyfin.Plugin.Ratings.Models;

public class UserRatingDetail
{
    public Guid UserId { get; set; }

    public string Username { get; set; } = string.Empty;

    public int Rating { get; set; }

    public DateTime CreatedAt { get; set; }
}
