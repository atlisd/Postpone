namespace Tasker.Api.Services;

public interface IPushoverClient
{
    Task<bool> SendAsync(string userKey, string title, string message, string? url = null);
}
