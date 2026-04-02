using JellyRate.Data;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace JellyRate;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost appHost)
    {
        services.AddSingleton<RatingsRepository>();
        services.AddSingleton<IStartupFilter, ScriptInjectionStartupFilter>();
        services.AddHostedService<ScriptInjector>();
    }
}
