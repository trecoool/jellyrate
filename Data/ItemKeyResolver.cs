using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;

namespace JellyRate.Data;

// Maps ratable items to path-independent rating keys ("movie:tmdb:603", "episode:tvdb:81189:s2e5").
// Jellyfin item ids hash the file path, so ratings keyed on them break when a folder moves.
public class ItemKeyResolver
{
    private const string FallbackPrefix = "jf:";
    private const string EpisodePrefix = "episode:";
    private const string PersonPrefix = "person:";
    private readonly ILibraryManager _libraryManager;
    private volatile Dictionary<string, Guid>? _keyMap;
    private volatile ConcurrentDictionary<string, Guid?> _lookups = new();

    public ItemKeyResolver(ILibraryManager libraryManager)
    {
        _libraryManager = libraryManager;
        _libraryManager.ItemAdded += (_, _) => Invalidate();
        _libraryManager.ItemUpdated += (_, _) => Invalidate();
        _libraryManager.ItemRemoved += (_, _) => Invalidate();
    }

    // Null when the item is missing or not ratable
    public string? GetKey(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        return item == null ? null : GetKey(item);
    }

    public static string? GetKey(BaseItem item) => item switch
    {
        Movie => BuildKey("movie", item, MetadataProvider.Tmdb, MetadataProvider.Imdb),
        Series => BuildKey("series", item, MetadataProvider.Tvdb, MetadataProvider.Tmdb),
        Episode episode => EpisodeKey(episode),
        Person => BuildKey("person", item, MetadataProvider.Tmdb, MetadataProvider.Imdb),
        _ => null
    };

    // Items without provider ids keep a path-bound key
    public static string FallbackKey(Guid itemId) => FallbackPrefix + itemId.ToString("N");

    public Guid? ResolveId(string key)
    {
        if (key.StartsWith(FallbackPrefix, StringComparison.Ordinal))
        {
            return Guid.TryParse(key.AsSpan(FallbackPrefix.Length), out var id) && _libraryManager.GetItemById(id) != null
                ? id
                : null;
        }

        if (key.StartsWith(EpisodePrefix, StringComparison.Ordinal) || key.StartsWith(PersonPrefix, StringComparison.Ordinal))
        {
            return _lookups.GetOrAdd(key, Lookup);
        }

        return GetKeyMap().TryGetValue(key, out var mapped) ? mapped : null;
    }

    // Season + episode numbers under the series key survive file renames and upgrades
    private static string EpisodeKey(Episode episode)
    {
        var seriesKey = episode.Series == null ? null : GetKey(episode.Series);
        if (seriesKey == null || seriesKey.StartsWith(FallbackPrefix, StringComparison.Ordinal)
            || episode.ParentIndexNumber is not { } season || episode.IndexNumber is not { } number)
        {
            return FallbackKey(episode.Id);
        }

        return $"{EpisodePrefix}{seriesKey["series:".Length..]}:s{season}e{number}";
    }

    private static string BuildKey(string kind, BaseItem item, params MetadataProvider[] providers)
    {
        foreach (var provider in providers)
        {
            if (item.TryGetProviderId(provider, out var id) && !string.IsNullOrWhiteSpace(id))
            {
                return $"{kind}:{provider.ToString().ToLowerInvariant()}:{id}";
            }
        }

        return FallbackKey(item.Id);
    }

    // Per-key query for types too numerous to map whole (persons, episodes)
    private Guid? Lookup(string key)
    {
        var parts = key.Split(':');
        if (parts.Length < 3)
        {
            return null;
        }

        var query = new InternalItemsQuery { Recursive = true };
        if (parts[0] == "person")
        {
            query.IncludeItemTypes = new[] { BaseItemKind.Person };
            query.HasAnyProviderId = new Dictionary<string, string> { [ProviderName(parts[1])] = parts[2] };
        }
        else
        {
            var numbers = parts[^1].Split('e');
            if (parts.Length != 4 || numbers.Length != 2
                || !int.TryParse(numbers[0].AsSpan(1), out var season) || !int.TryParse(numbers[1], out var number)
                || !GetKeyMap().TryGetValue($"series:{parts[1]}:{parts[2]}", out var seriesId))
            {
                return null;
            }

            query.IncludeItemTypes = new[] { BaseItemKind.Episode };
            query.AncestorIds = new[] { seriesId };
            query.ParentIndexNumber = season;
            query.IndexNumber = number;
        }

        return _libraryManager.GetItemList(query).FirstOrDefault(i => GetKey(i) == key)?.Id;
    }

    // "tmdb" → "Tmdb", the casing Jellyfin stores provider names under
    private static string ProviderName(string lower) =>
        Enum.TryParse<MetadataProvider>(lower, true, out var provider) ? provider.ToString() : lower;

    private void Invalidate()
    {
        _keyMap = null;
        _lookups = new ConcurrentDictionary<string, Guid?>();
    }

    // Rebuilt lazily after any library change; first item wins when two copies share a key
    private Dictionary<string, Guid> GetKeyMap()
    {
        var map = _keyMap;
        if (map != null)
        {
            return map;
        }

        map = new Dictionary<string, Guid>();
        var items = _libraryManager.GetItemList(new InternalItemsQuery
        {
            IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
            Recursive = true
        });
        foreach (var item in items)
        {
            var key = GetKey(item);
            if (key != null)
            {
                map.TryAdd(key, item.Id);
            }
        }

        _keyMap = map;
        return map;
    }
}
