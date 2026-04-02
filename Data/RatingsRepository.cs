using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using JellyRate.Models;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace JellyRate.Data;

public class RatingsRepository
{
    private readonly string _dataPath;
    private readonly string _filePath;
    private readonly ILogger<RatingsRepository> _logger;
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly object _cacheLock = new();
    private Dictionary<Guid, UserRating> _ratings = new();
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        WriteIndented = true
    };

    public RatingsRepository(IApplicationPaths applicationPaths, ILogger<RatingsRepository> logger)
    {
        _logger = logger;
        _dataPath = Path.Combine(applicationPaths.DataPath, "jellyrate");
        _filePath = Path.Combine(_dataPath, "ratings.json");
        Directory.CreateDirectory(_dataPath);
        LoadData();
    }

    private void LoadData()
    {
        try
        {
            if (File.Exists(_filePath))
            {
                var json = File.ReadAllText(_filePath);
                var list = JsonSerializer.Deserialize<List<UserRating>>(json, _jsonOptions) ?? new List<UserRating>();
                lock (_cacheLock)
                {
                    _ratings = list.ToDictionary(r => r.Id);
                }

                _logger.LogInformation("Loaded {Count} ratings from storage", list.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load ratings data");
            _ratings = new Dictionary<Guid, UserRating>();
        }
    }

    private async Task SaveDataAsync()
    {
        await _writeLock.WaitAsync().ConfigureAwait(false);
        try
        {
            List<UserRating> list;
            lock (_cacheLock)
            {
                list = _ratings.Values.ToList();
            }

            var json = JsonSerializer.Serialize(list, _jsonOptions);
            var tempPath = _filePath + ".tmp";
            await File.WriteAllTextAsync(tempPath, json).ConfigureAwait(false);
            File.Move(tempPath, _filePath, overwrite: true);
        }
        finally
        {
            _writeLock.Release();
        }
    }

    public async Task<UserRating> SetRatingAsync(Guid userId, Guid itemId, int rating)
    {
        UserRating entity;
        lock (_cacheLock)
        {
            var existing = _ratings.Values.FirstOrDefault(r => r.UserId == userId && r.ItemId == itemId);
            if (existing != null)
            {
                existing.Rating = rating;
                existing.UpdatedAt = DateTime.UtcNow;
                entity = existing;
            }
            else
            {
                entity = new UserRating
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ItemId = itemId,
                    Rating = rating,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                _ratings[entity.Id] = entity;
            }
        }

        await SaveDataAsync().ConfigureAwait(false);
        return entity;
    }

    public UserRating? GetUserRating(Guid userId, Guid itemId)
    {
        lock (_cacheLock)
        {
            return _ratings.Values.FirstOrDefault(r => r.UserId == userId && r.ItemId == itemId);
        }
    }

    public List<UserRating> GetItemRatings(Guid itemId)
    {
        lock (_cacheLock)
        {
            return _ratings.Values.Where(r => r.ItemId == itemId).ToList();
        }
    }

    public List<UserRating> GetUserRatings(Guid userId)
    {
        lock (_cacheLock)
        {
            return _ratings.Values
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.UpdatedAt)
                .ToList();
        }
    }

    public RatingStats GetRatingStats(Guid itemId, Guid? userId)
    {
        lock (_cacheLock)
        {
            var itemRatings = _ratings.Values.Where(r => r.ItemId == itemId).ToList();
            var config = Plugin.Instance?.Configuration;
            var min = config?.MinRating ?? 1;
            var max = config?.MaxRating ?? 10;
            var range = max - min + 1;
            var distribution = new int[range];

            foreach (var r in itemRatings)
            {
                var index = r.Rating - min;
                if (index >= 0 && index < range)
                {
                    distribution[index]++;
                }
            }

            var stats = new RatingStats
            {
                ItemId = itemId,
                AverageRating = itemRatings.Count > 0
                    ? Math.Round(itemRatings.Average(r => r.Rating), 2)
                    : 0,
                TotalRatings = itemRatings.Count,
                Distribution = distribution
            };

            if (userId.HasValue)
            {
                var userRating = itemRatings.FirstOrDefault(r => r.UserId == userId.Value);
                stats.UserRating = userRating?.Rating;
            }

            return stats;
        }
    }

    public Dictionary<Guid, (double AverageRating, int TotalRatings)> GetAllItemStats()
    {
        lock (_cacheLock)
        {
            return _ratings.Values
                .GroupBy(r => r.ItemId)
                .ToDictionary(
                    g => g.Key,
                    g => (
                        AverageRating: Math.Round(g.Average(r => r.Rating), 2),
                        TotalRatings: g.Count()
                    )
                );
        }
    }

    public async Task<bool> DeleteRatingAsync(Guid userId, Guid itemId)
    {
        bool found;
        lock (_cacheLock)
        {
            var existing = _ratings.Values.FirstOrDefault(r => r.UserId == userId && r.ItemId == itemId);
            if (existing == null)
            {
                return false;
            }

            found = _ratings.Remove(existing.Id);
        }

        if (found)
        {
            await SaveDataAsync().ConfigureAwait(false);
        }

        return found;
    }
}
