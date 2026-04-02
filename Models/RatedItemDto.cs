using System;

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
}
