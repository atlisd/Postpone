using System.Collections.Concurrent;

namespace Tasker.Api.Services;

public interface ILoginRateLimiter
{
    bool IsBlocked(string ip);
    void RecordFailure(string ip);
}

public class LoginRateLimiter : ILoginRateLimiter
{
    private const int MaxFailures = 10;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(1);

    private readonly ConcurrentDictionary<string, (int failures, DateTimeOffset windowStart)> _records = new();

    public bool IsBlocked(string ip)
    {
        if (!_records.TryGetValue(ip, out var record))
            return false;

        if (DateTimeOffset.UtcNow - record.windowStart > Window)
            return false;

        return record.failures >= MaxFailures;
    }

    public void RecordFailure(string ip)
    {
        _records.AddOrUpdate(
            ip,
            _ => (1, DateTimeOffset.UtcNow),
            (_, existing) =>
            {
                if (DateTimeOffset.UtcNow - existing.windowStart > Window)
                    return (1, DateTimeOffset.UtcNow);

                return (existing.failures + 1, existing.windowStart);
            });
    }
}
