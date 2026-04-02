using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace JellyRate;

public class ScriptInjectionStartupFilter : IStartupFilter
{
    private readonly ILogger<ScriptInjectionStartupFilter> _logger;

    public ScriptInjectionStartupFilter(ILogger<ScriptInjectionStartupFilter> logger)
    {
        _logger = logger;
    }

    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        _logger.LogInformation("JellyRate: Registering ScriptInjectionMiddleware in the ASP.NET Core pipeline");

        return app =>
        {
            app.UseMiddleware<ScriptInjectionMiddleware>();
            next(app);
        };
    }
}
