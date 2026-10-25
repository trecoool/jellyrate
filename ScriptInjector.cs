using System.Text.RegularExpressions;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace JellyRate;

public class ScriptInjector : IHostedService
{
    private readonly ILogger<ScriptInjector> _logger;
    private readonly IApplicationPaths _appPaths;

    private const string BeginComment = "<!-- BEGIN JellyRate Plugin -->";
    private const string EndComment = "<!-- END JellyRate Plugin -->";

    // Matches our block in index.html, so both injection layers replace it instead of stacking
    public static readonly Regex BlockRegex = new(
        Regex.Escape(BeginComment) + @"[\s\S]*?" + Regex.Escape(EndComment) + @"\s*");

    public static string BuildBlock(string basePath)
    {
        var src = $"{basePath}/Ratings/web/{Plugin.CacheBustToken}/main.js";
        return $"{BeginComment}\n<script type=\"module\" src=\"{src}\"></script>\n{EndComment}\n";
    }

    public ScriptInjector(ILogger<ScriptInjector> logger, IApplicationPaths appPaths)
    {
        _logger = logger;
        _appPaths = appPaths;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        return Task.Run(() =>
        {
            try
            {
                Thread.Sleep(2000);
                CleanupOldInjection();
                InjectScript();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "JellyRate: File injection failed, middleware will handle injection");
            }
        }, cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    private void CleanupOldInjection()
    {
        var indexPath = Path.Combine(_appPaths.WebPath, "index.html");
        if (!File.Exists(indexPath)) return;

        try
        {
            var content = File.ReadAllText(indexPath);
            if (BlockRegex.IsMatch(content))
            {
                content = BlockRegex.Replace(content, string.Empty);
                File.WriteAllText(indexPath, content);
                _logger.LogInformation("JellyRate: Cleaned up old injection from index.html");
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "JellyRate: Cleanup of old injection failed");
        }
    }

    private void InjectScript()
    {
        var indexPath = Path.Combine(_appPaths.WebPath, "index.html");
        if (!File.Exists(indexPath))
        {
            _logger.LogWarning("JellyRate: index.html not found at {Path}", indexPath);
            return;
        }

        try
        {
            var content = File.ReadAllText(indexPath);

            if (content.Contains(BeginComment, StringComparison.Ordinal))
            {
                _logger.LogInformation("JellyRate: Script already injected in index.html");
                return;
            }

            var injectionBlock = BuildBlock(string.Empty);

            if (content.Contains("</body>", StringComparison.Ordinal))
            {
                content = content.Replace("</body>", $"{injectionBlock}</body>", StringComparison.Ordinal);
                File.WriteAllText(indexPath, content);
                _logger.LogInformation("JellyRate: Injected script tag into {Path}", indexPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "JellyRate: File injection failed");
        }
    }
}
