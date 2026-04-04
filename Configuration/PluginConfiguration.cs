using MediaBrowser.Model.Plugins;

namespace JellyRate.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public bool EnableRatings { get; set; } = true;

    public int MinRating { get; set; } = 1;

    public int MaxRating { get; set; } = 10;

    public bool DisableUserRatedTab { get; set; } = false;
}
