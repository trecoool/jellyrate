using System;
using System.Collections.Generic;

namespace JellyRate.Models;

public class RatedItemDto
{
    public Guid ItemId { get; set; }

    public string Name { get; set; } = string.Empty;

    public int? ProductionYear { get; set; }

    public string Type { get; set; } = string.Empty;

    public bool HasPrimaryImage { get; set; }

    public double AverageRating { get; set; }

    public int TotalRatings { get; set; }

    public List<RatedItemUserRating> UserRatings { get; set; } = new();
}

public class RatedItemUserRating
{
    public Guid UserId { get; set; }

    public string Username { get; set; } = string.Empty;

    public int Rating { get; set; }
}
