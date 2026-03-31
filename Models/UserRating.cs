using System;

namespace JellyRate.Models;

public class UserRating
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public Guid ItemId { get; set; }

    public int Rating { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
