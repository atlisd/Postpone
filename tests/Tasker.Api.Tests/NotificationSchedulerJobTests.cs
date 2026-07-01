using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Tasker.Api.BackgroundJobs;
using Tasker.Api.Data;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;
using Xunit;

namespace Tasker.Api.Tests;

public class NotificationSchedulerJobTests
{
    // Regression: an 08:00 recurring task with a 12h reminder must fire at 20:00 the *previous*
    // evening. The bug was that recurring occurrences were only expanded for [today, today], so
    // on the evening the reminder should fire the occurrence (dated tomorrow) was invisible, and
    // by the time it became visible the fire time was already in the past.
    //
    // The series starts in the *past* (a running monthly task, like the reported case) so we
    // exercise a genuine later recurrence — not the first occurrence, which RecurrenceService
    // surfaces via its "series hasn't started yet" fallback and would mask the bug.
    [Fact]
    public async Task RecurringReminder_CrossesDayBoundary_FiresOnPreviousEvening()
    {
        var projectId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        // "Now" is 2026-07-01 20:00 UTC — the evening before the 2026-07-02 08:00 occurrence.
        var now = new DateTimeOffset(2026, 7, 1, 20, 0, 0, TimeSpan.Zero);

        await using var db = CreateDb();
        SeedRecurringTaskWithReminder(
            db, projectId, userId,
            // Monthly at 08:00 since 2026-06-02, so 2026-07-02 is an established recurrence.
            seriesStart: new DateOnly(2026, 6, 2),
            dueTimeUtc: new DateTime(2026, 6, 2, 8, 0, 0, DateTimeKind.Utc),
            rrule: "FREQ=MONTHLY",
            reminderOffsetMinutes: 12 * 60);

        var pushover = new FakePushoverClient();
        var user = await db.Users.FirstAsync();
        var job = CreateJob(now);

        await job.ProcessUserNotifications(db, pushover, new FakeAccess(projectId), user, CancellationToken.None);

        Assert.Single(pushover.Sent);
        Assert.Equal("Task reminder", pushover.Sent[0].Title);
    }

    // The reminder must only fire inside its ~15 minute window, not on unrelated ticks.
    [Fact]
    public async Task RecurringReminder_OutsideFireWindow_DoesNotFire()
    {
        var projectId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        // A full day before the reminder is due to fire (fires 2026-07-01 20:00, now is 06-30 20:00).
        var now = new DateTimeOffset(2026, 6, 30, 20, 0, 0, TimeSpan.Zero);

        await using var db = CreateDb();
        SeedRecurringTaskWithReminder(
            db, projectId, userId,
            seriesStart: new DateOnly(2026, 6, 2),
            dueTimeUtc: new DateTime(2026, 6, 2, 8, 0, 0, DateTimeKind.Utc),
            rrule: "FREQ=MONTHLY",
            reminderOffsetMinutes: 12 * 60);

        var pushover = new FakePushoverClient();
        var user = await db.Users.FirstAsync();
        var job = CreateJob(now);

        await job.ProcessUserNotifications(db, pushover, new FakeAccess(projectId), user, CancellationToken.None);

        Assert.Empty(pushover.Sent);
    }

    private static TaskerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<TaskerDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new TaskerDbContext(options);
    }

    private static NotificationSchedulerJob CreateJob(DateTimeOffset now)
    {
        var config = new ConfigurationBuilder().Build();
        var timeProvider = new FakeTimeProvider(now);
        // scopeFactory is unused by ProcessUserNotifications (which receives its own deps as args).
        return new NotificationSchedulerJob(null!, NullLogger<NotificationSchedulerJob>.Instance, config, timeProvider);
    }

    private static void SeedRecurringTaskWithReminder(
        TaskerDbContext db, Guid projectId, Guid userId,
        DateOnly seriesStart, DateTime dueTimeUtc, string rrule, int reminderOffsetMinutes)
    {
        var user = new User
        {
            Id = userId,
            Email = "test@example.com",
            EmailNormalized = "test@example.com",
            DisplayName = "Test",
            Timezone = "UTC",
            Locale = "en",
            PushoverUserKey = "pushover-key",
        };
        var project = new Project { Id = projectId, OwnerId = userId, Name = "Test Project" };
        var task = new TodoTask
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            CreatedById = userId,
            Title = "Recurring 8am task",
            DueDate = seriesStart,
            DueDateTime = dueTimeUtc,
            Rrule = rrule,
            Reminders = [new TaskReminder { Id = Guid.NewGuid(), OffsetMinutes = reminderOffsetMinutes }],
        };

        db.Users.Add(user);
        db.Projects.Add(project);
        db.Tasks.Add(task);
        db.SaveChanges();
    }

    private sealed class FakePushoverClient : IPushoverClient
    {
        public List<(string Title, string Message)> Sent { get; } = [];

        public Task<bool> SendAsync(string userKey, string title, string message, string? url = null)
        {
            Sent.Add((title, message));
            return Task.FromResult(true);
        }
    }

    private sealed class FakeAccess(Guid projectId) : IProjectAccessService
    {
        public Task<List<Guid>> GetAccessibleProjectIdsAsync(Guid userId) => Task.FromResult(new List<Guid> { projectId });
        public Task<bool> CanAccessProjectAsync(Guid userId, Guid pid) => Task.FromResult(true);
        public Task<bool> CanEditProjectAsync(Guid userId, Guid pid) => Task.FromResult(true);
        public IQueryable<TodoTask> GetAccessibleTasks(Guid userId) => throw new NotSupportedException();
    }

    private sealed class FakeTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
