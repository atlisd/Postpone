using System.Net.Http.Json;

namespace Tasker.Api.Services;

public class PushoverClient(IConfiguration configuration, IHttpClientFactory httpClientFactory, ILogger<PushoverClient> logger) : IPushoverClient
{
    private readonly string? _apiToken = configuration["Pushover:ApiToken"];

    public async Task<bool> SendAsync(string userKey, string title, string message, string? url = null)
    {
        if (string.IsNullOrEmpty(_apiToken))
        {
            logger.LogWarning("Pushover API token not configured, skipping notification");
            return false;
        }

        try
        {
            var client = httpClientFactory.CreateClient();
            var payload = new Dictionary<string, string>
            {
                ["token"] = _apiToken,
                ["user"] = userKey,
                ["title"] = title,
                ["message"] = message,
            };

            if (!string.IsNullOrEmpty(url))
                payload["url"] = url;

            var response = await client.PostAsync(
                "https://api.pushover.net/1/messages.json",
                new FormUrlEncodedContent(payload));

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync();
                logger.LogWarning("Pushover API returned {Status}: {Body}", response.StatusCode, body);
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send Pushover notification");
            return false;
        }
    }
}
