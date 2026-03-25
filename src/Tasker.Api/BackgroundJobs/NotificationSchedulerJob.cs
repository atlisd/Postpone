using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

namespace Tasker.Api.BackgroundJobs;

public class NotificationSchedulerJob(IServiceScopeFactory scopeFactory, ILogger<NotificationSchedulerJob> logger) : IHostedService, IDisposable
{
    private Timer? _timer;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("NotificationSchedulerJob starting");
        _timer = new Timer(DoWork, null, TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(15));
        return Task.CompletedTask;
    }

    private async void DoWork(object? state)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TaskerDbContext>();
            var pushover = scope.ServiceProvider.GetRequiredService<IPushoverClient>();
            var access = scope.ServiceProvider.GetRequiredService<IProjectAccessService>();

            // Find users with Pushover keys
            var users = await db.Users
                .Where(u => u.PushoverUserKey != null && u.PushoverUserKey != "")
                .ToListAsync();

            foreach (var user in users)
            {
                await ProcessUserNotifications(db, pushover, access, user);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error in notification scheduler");
        }
    }

    private async Task ProcessUserNotifications(TaskerDbContext db, IPushoverClient pushover, IProjectAccessService access, User user)
    {
        var now = DateTime.UtcNow;
        var projectIds = await access.GetAccessibleProjectIdsAsync(user.Id);

        // Find tasks due within the next hour that haven't been notified
        var tasks = await db.Tasks
            .Include(t => t.Project)
            .Where(t => projectIds.Contains(t.ProjectId)
                && !t.IsDeleted
                && t.CompletedAt == null
                && t.DueDate.HasValue
                && t.RecurrenceParentId == null || t.Rrule == null) // don't notify templates
            .ToListAsync();

        foreach (var task in tasks)
        {
            // Check if task is due today (in user's timezone)
            TimeZoneInfo tz;
            try { tz = TimeZoneInfo.FindSystemTimeZoneById(user.Timezone); }
            catch { tz = TimeZoneInfo.Utc; }

            var userNow = TimeZoneInfo.ConvertTimeFromUtc(now, tz);
            var dueDate = task.DueDate!.Value;

            // Notify if task is due today and it's morning (8 AM-9 AM local time)
            // or if task is overdue (past due date)
            var isOverdue = dueDate < DateOnly.FromDateTime(userNow);
            var isDueToday = dueDate == DateOnly.FromDateTime(userNow);
            var isMorning = userNow.Hour >= 8 && userNow.Hour < 9;

            if (!isDueToday && !isOverdue) continue;
            if (isDueToday && !isMorning) continue;

            // Dedup check
            var payloadHash = ComputeHash($"{user.Id}:{task.Id}:{dueDate}");
            var alreadySent = await db.NotificationLogs
                .AnyAsync(n => n.PayloadHash == payloadHash);
            if (alreadySent) continue;

            var title = isOverdue ? "Overdue task" : "Task due today";
            var message = $"{task.Title} — {task.Project.Name}";

            var sent = await pushover.SendAsync(user.PushoverUserKey!, title, message);

            if (sent)
            {
                db.NotificationLogs.Add(new NotificationLog
                {
                    UserId = user.Id,
                    TaskId = task.Id,
                    Channel = "pushover",
                    SentAt = now,
                    PayloadHash = payloadHash,
                });
                await db.SaveChangesAsync();

                logger.LogInformation("Sent notification to {User} for task {Task}", user.Email, task.Title);
            }
        }
    }

    private static string ComputeHash(string input)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexStringLower(bytes);
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _timer?.Change(Timeout.Infinite, 0);
        return Task.CompletedTask;
    }

    public void Dispose()
    {
        _timer?.Dispose();
    }
}
