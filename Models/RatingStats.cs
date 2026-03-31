using System;

namespace Jellyfin.Plugin.Ratings.Models;

public class RatingStats
{
    public Guid ItemId { get; set; }

    public double AverageRating { get; set; }

    public int TotalRatings { get; set; }

    public int? UserRating { get; set; }

    public int[] Distribution { get; set; } = new int[10];
}
