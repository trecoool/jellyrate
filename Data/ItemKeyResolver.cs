using System;
using System.Collections.Generic;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;

namespace JellyRate.Data;

// Maps movies and series to path-independent rating keys ("movie:tmdb:603", "series:tvdb:81189").
// Jellyfin item ids hash the file path, so ratings keyed on them break when a folder moves.
public class ItemKeyResolver
{
    private const string FallbackPrefix = "jf:";
    private readonly ILibraryManager _libraryManager;
    private volatile Dictionary<string, Guid>? _keyMap;

    public ItemKeyResolver(ILibraryManager libraryManager)
    {
        _libraryManager = libraryManager;
        _libraryManager.ItemAdded += (_, _) => _keyMap = null;
        _libraryManager.ItemUpdated += (_, _) => _keyMap = null;
        _libraryManager.ItemRemoved += (_, _) => _keyMap = null;
    }

    // Null when the item is missing or not a movie/series
    public string? GetKey(Guid itemId)
    {
        var item = _libraryManager.GetItemById(itemId);
        return item == null ? null : GetKey(item);
    }

    public static string? GetKey(BaseItem item) => item switch
    {
        Movie => BuildKey("movie", item, MetadataProvider.Tmdb, MetadataProvider.Imdb),
        Series => BuildKey("series", item, MetadataProvider.Tvdb, MetadataProvider.Tmdb),
        _ => null
    };

    // Items without provider ids keep a path-bound key
    public static string FallbackKey(Guid itemId) => FallbackPrefix + itemId.ToString("N");

    public Guid? ResolveId(string key)
    {
        if (key.StartsWith(FallbackPrefix, StringComparison.Ordinal))
        {
            return Guid.TryParse(key.AsSpan(FallbackPrefix.Length), out var id) ? id : null;
        }

        return GetKeyMap().TryGetValue(key, out var mapped) ? mapped : null;
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
