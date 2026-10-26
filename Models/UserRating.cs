using System;

namespace JellyRate.Models;

public class UserRating
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    // Last known Jellyfin id; ItemKey is the identity
    public Guid ItemId { get; set; }

    public string? ItemKey { get; set; }

    public int Rating { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
