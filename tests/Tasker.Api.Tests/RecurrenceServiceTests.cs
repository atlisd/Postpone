using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Tasker.Api.Data;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;
using Xunit;

namespace Tasker.Api.Tests;

public class RecurrenceServiceTests
{
    // Regression: project/tag lists expand [today-1y, today+90d] and show the next open occurrence
    // per series. For yearly (or 3+ monthly) series, completing the in-range occurrence left the
    // next one beyond the window, so the whole series disappeared from the list.
    [Theory]
    [InlineData("FREQ=YEARLY", 2027, 3, 1)]
    [InlineData("FREQ=MONTHLY;INTERVAL=3", 2026, 6, 1)]
    public async Task CompletedLongIntervalOccurrence_SurfacesNextBeyondRange(string rrule, int y, int m, int d)
    {
        var today = new DateOnly(2026, 3, 1);
        await using var db = CreateDb();
        var taskId = Seed(db, rrule, seriesStart: new DateOnly(2025, 3, 1));
        var service = new RecurrenceService(db, NullLogger<RecurrenceService>.Instance);

        await service.CompleteOccurrenceAsync(taskId, today);

        var rangeEnd = new DateOnly(2026, 3, 31); // shorter than the interval, like the 90-day window vs. yearly
        var result = await service.ExpandOccurrencesAsync(db.Tasks, today, rangeEnd, includeNextBeyondRange: true);

        var open = Assert.Single(result, r => r.CompletedAt == null);
        Assert.Equal(new DateOnly(y, m, d), open.DueDate);

        // Without the flag (calendar-style range queries) nothing outside the range is returned.
        var strict = await service.ExpandOccurrencesAsync(db.Tasks, today, rangeEnd);
        Assert.DoesNotContain(strict, r => r.CompletedAt == null);
    }

    [Fact]
    public async Task FinishedSeries_DoesNotSurfaceAnything()
    {
        var today = new DateOnly(2026, 3, 1);
        await using var db = CreateDb();
        var taskId = Seed(db, "FREQ=YEARLY;COUNT=2", seriesStart: new DateOnly(2025, 3, 1));
        var service = new RecurrenceService(db, NullLogger<RecurrenceService>.Instance);

        await service.CompleteOccurrenceAsync(taskId, today);

        var result = await service.ExpandOccurrencesAsync(db.Tasks, today, today.AddDays(90), includeNextBeyondRange: true);
        Assert.DoesNotContain(result, r => r.CompletedAt == null);
    }

    private static TaskerDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<TaskerDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new TaskerDbContext(options);
    }

    private static Guid Seed(TaskerDbContext db, string rrule, DateOnly seriesStart)
    {
        var userId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var task = new TodoTask
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            CreatedById = userId,
            Title = "Birthday",
            DueDate = seriesStart,
            Rrule = rrule,
        };
        db.Users.Add(new User
        {
            Id = userId, Email = "t@example.com", EmailNormalized = "t@example.com",
            DisplayName = "T", Timezone = "UTC", Locale = "en",
        });
        db.Projects.Add(new Project { Id = projectId, OwnerId = userId, Name = "Birthdays" });
        db.Tasks.Add(task);
        db.SaveChanges();
        return task.Id;
    }
}
