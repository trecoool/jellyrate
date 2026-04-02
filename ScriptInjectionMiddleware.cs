using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace JellyRate;

public class ScriptInjectionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ScriptInjectionMiddleware> _logger;

    public ScriptInjectionMiddleware(RequestDelegate next, ILogger<ScriptInjectionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? string.Empty;

        if (!IsIndexHtmlRequest(path))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        _logger.LogDebug("JellyRate: Intercepting request - Path={Path}, PathBase={PathBase}",
            path, context.Request.PathBase.Value);

        // Remove Accept-Encoding to prevent compressed response
        context.Request.Headers.Remove("Accept-Encoding");

        var originalBodyStream = context.Response.Body;

        try
        {
            using var memoryStream = new MemoryStream();
            context.Response.Body = memoryStream;

            await _next(context).ConfigureAwait(false);

            if (context.Response.StatusCode != 200)
            {
                await WriteOriginalResponse(memoryStream, originalBodyStream).ConfigureAwait(false);
                return;
            }

            var contentEncoding = context.Response.Headers.ContentEncoding.ToString();
            if (!string.IsNullOrEmpty(contentEncoding))
            {
                await WriteOriginalResponse(memoryStream, originalBodyStream).ConfigureAwait(false);
                return;
            }

            var contentType = context.Response.ContentType ?? string.Empty;
            if (!contentType.StartsWith("text/html", StringComparison.OrdinalIgnoreCase))
            {
                await WriteOriginalResponse(memoryStream, originalBodyStream).ConfigureAwait(false);
                return;
            }

            memoryStream.Position = 0;
            string responseBody;
            using (var reader = new StreamReader(memoryStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 1024, leaveOpen: true))
            {
                responseBody = await reader.ReadToEndAsync().ConfigureAwait(false);
            }

            if (string.IsNullOrEmpty(responseBody))
            {
                await WriteOriginalResponse(memoryStream, originalBodyStream).ConfigureAwait(false);
                return;
            }

            if (responseBody.Contains("jellyrate.js", StringComparison.OrdinalIgnoreCase))
            {
                await WriteOriginalResponse(memoryStream, originalBodyStream).ConfigureAwait(false);
                return;
            }

            var basePath = context.Request.PathBase.Value?.TrimEnd('/') ?? string.Empty;

            if (string.IsNullOrEmpty(basePath))
            {
                var webIndex = path.IndexOf("/web/", StringComparison.OrdinalIgnoreCase);
                if (webIndex < 0 && path.EndsWith("/web", StringComparison.OrdinalIgnoreCase))
                {
                    webIndex = path.Length - 4;
                }

                if (webIndex > 0)
                {
                    basePath = path.Substring(0, webIndex);
                }
            }

            var safeBasePath = System.Net.WebUtility.HtmlEncode(basePath);
            var scriptTag = $"<script defer src=\"{safeBasePath}/Ratings/jellyrate.js\"></script>";

            var bodyCloseIndex = responseBody.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
            if (bodyCloseIndex == -1)
            {
                _logger.LogWarning("JellyRate: No </body> tag found in response");
                await WriteOriginalResponse(memoryStream, originalBodyStream).ConfigureAwait(false);
                return;
            }

            var modifiedBody = responseBody.Insert(bodyCloseIndex, scriptTag + "\n");
            var modifiedBytes = Encoding.UTF8.GetBytes(modifiedBody);

            context.Response.Headers.Remove("Content-Length");
            context.Response.ContentLength = modifiedBytes.Length;

            await originalBodyStream.WriteAsync(modifiedBytes, 0, modifiedBytes.Length).ConfigureAwait(false);
            _logger.LogInformation("JellyRate: Successfully injected script tag via middleware");
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "JellyRate: Script injection failed, passing through original response");
            try
            {
                await WriteOriginalResponse(context.Response.Body as MemoryStream ?? new MemoryStream(), originalBodyStream).ConfigureAwait(false);
            }
            catch { /* last resort */ }
        }
        finally
        {
            context.Response.Body = originalBodyStream;
        }
    }

    private static async Task WriteOriginalResponse(MemoryStream memoryStream, Stream originalBodyStream)
    {
        if (memoryStream.Length > 0)
        {
            memoryStream.Position = 0;
            await memoryStream.CopyToAsync(originalBodyStream).ConfigureAwait(false);
        }
    }

    private static bool IsIndexHtmlRequest(string path)
    {
        return path.Equals("/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/index.html", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/web/index.html", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase);
    }
}
