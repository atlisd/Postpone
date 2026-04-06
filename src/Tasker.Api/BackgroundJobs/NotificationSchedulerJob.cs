using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Tasker.Api.Data;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

namespace Tasker.Api.BackgroundJobs;

public class NotificationSchedulerJob(IServiceScopeFactory scopeFactory, ILogger<NotificationSchedulerJob> logger, IConfiguration configuration) : IHostedService, IDisposable
{
    private Timer? _timer;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("NotificationSchedulerJob starting");
        _timer = new Timer(DoWork, null, TimeSpan.FromSeconds(10), TimeSpan.FromMinutes(1));
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

        // Non-recurring tasks
        var tasks = await db.Tasks
            .Include(t => t.Project)
            .Include(t => t.Reminders)
            .Where(t => projectIds.Contains(t.ProjectId)
                && !t.IsDeleted
                && t.CompletedAt == null
                && (t.DueDate.HasValue || t.DueDateTime.HasValue)
                && t.Rrule == null)
            .ToListAsync();

        TimeZoneInfo tz;
        try { tz = TimeZoneInfo.FindSystemTimeZoneById(user.Timezone); }
        catch { tz = TimeZoneInfo.Utc; }

        var userNow = TimeZoneInfo.ConvertTimeFromUtc(now, tz);

        foreach (var task in tasks)
        {
            if (task.DueDateTime.HasValue)
            {
                if (task.Reminders.Count > 0)
                    await ProcessReminderNotifications(db, pushover, user, task, now, tz);
                else
                    await ProcessTimedNotification(db, pushover, user, task, now, tz);
            }
            else
                await ProcessDateOnlyNotification(db, pushover, user, task, now, userNow);
        }

        // Recurring task occurrences — expand for today and check notifications
        var recurrenceService = new RecurrenceService(db, LoggerFactory.Create(b => { }).CreateLogger<RecurrenceService>());
        var today = DateOnly.FromDateTime(userNow);
        var recurringQuery = db.Tasks
            .Where(t => projectIds.Contains(t.ProjectId) && !t.IsDeleted && t.Rrule != null);
        var virtualInstances = await recurrenceService.ExpandOccurrencesAsync(recurringQuery, today, today);

        foreach (var instance in virtualInstances.Where(v => v.CompletedAt == null))
        {
            await ProcessRecurringDateNotification(db, pushover, user, instance, now, userNow);
        }
    }

    private async Task ProcessTimedNotification(
        TaskerDbContext db, IPushoverClient pushover,
        User user, TodoTask task, DateTime utcNow, TimeZoneInfo tz)
    {
        var dueUtc = task.DueDateTime!.Value;
        var windowStart = utcNow.AddMinutes(-2);
        if (dueUtc < windowStart || dueUtc > utcNow) return;

        var dueDateTimeForHash = dueUtc.ToString("yyyy-MM-ddTHH:mm");
        var payloadHash = ComputeHash($"{user.Id}:{task.Id}:time:{dueDateTimeForHash}");
        if (await db.NotificationLogs.AnyAsync(n => n.PayloadHash == payloadHash)) return;

        var dueLocal = TimeZoneInfo.ConvertTimeFromUtc(dueUtc, tz);
        CultureInfo culture;
        try { culture = new CultureInfo(user.Locale); }
        catch { culture = CultureInfo.InvariantCulture; }
        var timeStr = dueLocal.ToString("t", culture);
        var message = $"{task.Title} — {task.Project.Name} (due at {timeStr})";
        var url = BuildTaskUrl(task.ProjectId, task.Id, null);

        var sent = await pushover.SendAsync(user.PushoverUserKey!, "Task due now", message, url);
        if (sent)
        {
            db.NotificationLogs.Add(new NotificationLog
            {
                UserId = user.Id,
                TaskId = task.Id,
                Channel = "pushover",
                SentAt = utcNow,
                PayloadHash = payloadHash,
            });
            await db.SaveChangesAsync();
            logger.LogInformation("Sent timed notification to {User} for task {Task}", user.Email, task.Title);
        }
    }

    private async Task ProcessDateOnlyNotification(
        TaskerDbContext db, IPushoverClient pushover,
        User user, TodoTask task, DateTime utcNow, DateTime userNow)
    {
        var dueDate = task.DueDate!.Value;
        var isOverdue = dueDate < DateOnly.FromDateTime(userNow);
        var isDueToday = dueDate == DateOnly.FromDateTime(userNow);
        var isMorning = userNow.Hour >= 8 && userNow.Hour < 9;

        if (!isDueToday && !isOverdue) return;
        if (isDueToday && !isMorning) return;
        if (isOverdue && !user.OverdueNotificationsEnabled) return;
        if (isOverdue && userNow.Hour != user.OverdueNotificationHour) return;

        var payloadHash = ComputeHash($"{user.Id}:{task.Id}:{dueDate}");
        if (await db.NotificationLogs.AnyAsync(n => n.PayloadHash == payloadHash)) return;

        var title = isOverdue ? "Overdue task" : "Task due today";
        var message = $"{task.Title} — {task.Project.Name}";
        var url = BuildTaskUrl(task.ProjectId, task.Id, null);

        var sent = await pushover.SendAsync(user.PushoverUserKey!, title, message, url);
        if (sent)
        {
            db.NotificationLogs.Add(new NotificationLog
            {
                UserId = user.Id,
                TaskId = task.Id,
                Channel = "pushover",
                SentAt = utcNow,
                PayloadHash = payloadHash,
            });
            await db.SaveChangesAsync();
            logger.LogInformation("Sent notification to {User} for task {Task}", user.Email, task.Title);
        }
    }

    private async Task ProcessRecurringDateNotification(
        TaskerDbContext db, IPushoverClient pushover,
        User user, Models.Dtos.Tasks.TaskResponse instance, DateTime utcNow, DateTime userNow)
    {
        var dueDate = instance.DueDate!.Value;
        var isOverdue = dueDate < DateOnly.FromDateTime(userNow);
        var isDueToday = dueDate == DateOnly.FromDateTime(userNow);
        var isMorning = userNow.Hour >= 8 && userNow.Hour < 9;

        if (!isDueToday && !isOverdue) return;
        if (isDueToday && !isMorning) return;
        if (isOverdue && !user.OverdueNotificationsEnabled) return;
        if (isOverdue && userNow.Hour != user.OverdueNotificationHour) return;

        var payloadHash = ComputeHash($"{user.Id}:{instance.Id}:recurrence:{instance.OccurrenceDate}");
        if (await db.NotificationLogs.AnyAsync(n => n.PayloadHash == payloadHash)) return;

        var title = isOverdue ? "Overdue task" : "Task due today";
        var message = $"{instance.Title} — {instance.ProjectName}";
        var url = BuildTaskUrl(instance.ProjectId, instance.Id, instance.OccurrenceDate);

        var sent = await pushover.SendAsync(user.PushoverUserKey!, title, message, url);
        if (sent)
        {
            db.NotificationLogs.Add(new NotificationLog
            {
                UserId = user.Id,
                TaskId = instance.Id,
                Channel = "pushover",
                SentAt = utcNow,
                PayloadHash = payloadHash,
            });
            await db.SaveChangesAsync();
            logger.LogInformation("Sent recurring notification to {User} for task {Task} occurrence {Date}",
                user.Email, instance.Title, instance.OccurrenceDate);
        }
    }

    private async Task ProcessReminderNotifications(
        TaskerDbContext db, IPushoverClient pushover,
        User user, TodoTask task, DateTime utcNow, TimeZoneInfo tz)
    {
        var dueUtc = task.DueDateTime!.Value;

        foreach (var reminder in task.Reminders)
        {
            var fireUtc = dueUtc.AddMinutes(-reminder.OffsetMinutes);
            var windowStart = utcNow.AddMinutes(-2);
            if (fireUtc < windowStart || fireUtc > utcNow) continue;

            var payloadHash = ComputeHash($"{user.Id}:{task.Id}:reminder:{reminder.Id}:{dueUtc:yyyy-MM-ddTHH:mm}");
            if (await db.NotificationLogs.AnyAsync(n => n.PayloadHash == payloadHash)) continue;

            var message = FormatReminderMessage(task.Title, task.Project.Name, reminder.OffsetMinutes, dueUtc, tz, user.Locale);
            var url = BuildTaskUrl(task.ProjectId, task.Id, null);
            var title = reminder.OffsetMinutes == 0 ? "Task due now" : "Task reminder";

            var sent = await pushover.SendAsync(user.PushoverUserKey!, title, message, url);
            if (sent)
            {
                db.NotificationLogs.Add(new NotificationLog
                {
                    UserId = user.Id,
                    TaskId = task.Id,
                    Channel = "pushover",
                    SentAt = utcNow,
                    PayloadHash = payloadHash,
                });
                await db.SaveChangesAsync();
                logger.LogInformation("Sent reminder notification to {User} for task {Task} (offset {Offset} min)",
                    user.Email, task.Title, reminder.OffsetMinutes);
            }
        }
    }

    private static string FormatReminderMessage(
        string taskTitle, string projectName, int offsetMinutes, DateTime dueUtc, TimeZoneInfo tz, string locale)
    {
        var dueLocal = TimeZoneInfo.ConvertTimeFromUtc(dueUtc, tz);
        CultureInfo culture;
        try { culture = new CultureInfo(locale); }
        catch { culture = CultureInfo.InvariantCulture; }
        var timeStr = dueLocal.ToString("t", culture);

        string offsetLabel;
        if (offsetMinutes == 0)
        {
            offsetLabel = $"due at {timeStr}";
        }
        else if (offsetMinutes < 60)
        {
            offsetLabel = $"in {offsetMinutes} minute{(offsetMinutes == 1 ? "" : "s")} at {timeStr}";
        }
        else if (offsetMinutes < 1440)
        {
            var hours = offsetMinutes / 60;
            offsetLabel = $"in {hours} hour{(hours == 1 ? "" : "s")} at {timeStr}";
        }
        else
        {
            var days = offsetMinutes / 1440;
            offsetLabel = $"in {days} day{(days == 1 ? "" : "s")} at {timeStr}";
        }

        return $"{taskTitle} — {projectName} ({offsetLabel})";
    }

    private string BuildTaskUrl(Guid projectId, Guid taskId, DateOnly? occurrenceDate)
    {
        var baseUrl = configuration["App:Url"]?.TrimEnd('/') ?? "";
        var url = $"{baseUrl}/app/projects/{projectId}?task={taskId}";
        if (occurrenceDate.HasValue)
            url += $"&occurrence={occurrenceDate.Value:yyyy-MM-dd}";
        return url;
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
