using Ical.Net;
using Ical.Net.CalendarComponents;
using Ical.Net.DataTypes;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Models.Dtos.Tasks;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public class RecurrenceService(TaskerDbContext db, ILogger<RecurrenceService> logger) : IRecurrenceService
{
    public async Task<List<TaskResponse>> ExpandOccurrencesAsync(
        IQueryable<TodoTask> seriesTasks, DateOnly rangeStart, DateOnly rangeEnd)
    {
        var masters = await seriesTasks
            .Where(t => t.Rrule != null && !t.IsDeleted)
            .Include(t => t.RecurrenceExceptions)
                .ThenInclude(e => e.SubtaskCompletions)
            .Include(t => t.Subtasks.OrderBy(s => s.SortOrder))
            .Include(t => t.TaskTags).ThenInclude(tt => tt.Tag)
            .Include(t => t.Reminders)
            .Include(t => t.Project)
            .Include(t => t.CreatedBy)
            .Include(t => t.AssignedTo)
            .AsSplitQuery()
            .ToListAsync();

        var result = new List<TaskResponse>();

        foreach (var master in masters)
        {
            try
            {
                var occurrences = GetOccurrences(master.Rrule!, master.DueDate ?? DateOnly.FromDateTime(DateTime.UtcNow), rangeStart, rangeEnd);

                // Build lookup of exceptions by original date
                var exceptionsByDate = master.RecurrenceExceptions
                    .GroupBy(e => e.OriginalDate)
                    .ToDictionary(g => g.Key, g => g.First());

                // Also find exceptions that reschedule INTO this range but whose original date is outside
                var rescheduledIntoRange = master.RecurrenceExceptions
                    .Where(e => e.OverriddenDueDate.HasValue
                        && e.OverriddenDueDate.Value >= rangeStart
                        && e.OverriddenDueDate.Value <= rangeEnd
                        && (e.OriginalDate < rangeStart || e.OriginalDate > rangeEnd))
                    .ToList();

                foreach (var occurrenceDate in occurrences)
                {
                    exceptionsByDate.TryGetValue(occurrenceDate, out var exception);

                    if (exception is { IsSkipped: true }) continue;

                    var response = BuildOccurrenceResponse(master, occurrenceDate, exception);
                    result.Add(response);
                }

                // Add occurrences rescheduled into this range
                foreach (var ex in rescheduledIntoRange)
                {
                    if (ex.IsSkipped) continue;
                    var response = BuildOccurrenceResponse(master, ex.OriginalDate, ex);
                    result.Add(response);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to expand occurrences for series {TaskId}", master.Id);
            }
        }

        return result;
    }

    public async Task SetRecurrenceAsync(Guid taskId, string rrule)
    {
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return;

        // Validate RRULE
        try { _ = new RecurrencePattern(rrule); }
        catch (Exception ex) { throw new ArgumentException($"Invalid RRULE: {rrule}", ex); }

        task.Rrule = rrule;
        task.DueDate ??= DateOnly.FromDateTime(DateTime.UtcNow);

        await db.SaveChangesAsync();
    }

    public async Task RemoveRecurrenceAsync(Guid taskId)
    {
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return;

        task.Rrule = null;

        // Delete all exceptions for this series
        var exceptions = await db.RecurrenceExceptions
            .Where(e => e.TaskId == taskId)
            .ToListAsync();
        db.RecurrenceExceptions.RemoveRange(exceptions);

        await db.SaveChangesAsync();
    }

    public async Task<RecurrenceException> CompleteOccurrenceAsync(Guid seriesId, DateOnly occurrenceDate)
    {
        var exception = await GetOrCreateExceptionAsync(seriesId, occurrenceDate);
        exception.CompletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return exception;
    }

    public async Task UncompleteOccurrenceAsync(Guid seriesId, DateOnly occurrenceDate)
    {
        var exception = await db.RecurrenceExceptions
            .FirstOrDefaultAsync(e => e.TaskId == seriesId && e.OriginalDate == occurrenceDate);

        if (exception is null) return;

        exception.CompletedAt = null;

        // If exception has no other overrides, delete it
        if (IsEmptyException(exception))
            db.RecurrenceExceptions.Remove(exception);

        await db.SaveChangesAsync();
    }

    public async Task SkipOccurrenceAsync(Guid seriesId, DateOnly occurrenceDate)
    {
        var exception = await GetOrCreateExceptionAsync(seriesId, occurrenceDate);
        exception.IsSkipped = true;
        await db.SaveChangesAsync();
    }

    public async Task<RecurrenceException> EditOccurrenceAsync(
        Guid seriesId, DateOnly occurrenceDate, EditOccurrenceRequest request)
    {
        var exception = await GetOrCreateExceptionAsync(seriesId, occurrenceDate);

        if (request.Title is not null) exception.Title = request.Title;
        if (request.Description is not null) exception.Description = request.Description;
        if (request.Priority.HasValue) exception.Priority = request.Priority.Value;
        if (request.ClearAssignedTo) { exception.AssignedToId = null; exception.ClearAssignedTo = true; }
        else if (request.AssignedToId.HasValue) { exception.AssignedToId = request.AssignedToId.Value; exception.ClearAssignedTo = false; }

        await db.SaveChangesAsync();
        return exception;
    }

    public async Task<RecurrenceException> RescheduleOccurrenceAsync(
        Guid seriesId, DateOnly occurrenceDate, DateOnly newDate)
    {
        var exception = await GetOrCreateExceptionAsync(seriesId, occurrenceDate);
        exception.OverriddenDueDate = newDate;
        await db.SaveChangesAsync();
        return exception;
    }

    public async Task<(TodoTask original, TodoTask newTask)> SplitSeriesFromAsync(
        Guid taskId, DateOnly fromDate, DateOnly newDate)
    {
        var original = await db.Tasks
            .Include(t => t.Subtasks)
            .FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted && t.Rrule != null)
            ?? throw new InvalidOperationException($"Recurring task {taskId} not found.");

        // Build UNTIL date (day before fromDate) in RRULE format YYYYMMDD
        var until = fromDate.AddDays(-1).ToString("yyyyMMdd");

        // Strip any existing UNTIL= or COUNT= parts, then append the new UNTIL
        var parts = original.Rrule!.Split(';')
            .Where(p => !p.StartsWith("UNTIL=", StringComparison.OrdinalIgnoreCase)
                     && !p.StartsWith("COUNT=", StringComparison.OrdinalIgnoreCase))
            .ToList();
        parts.Add($"UNTIL={until}");
        original.Rrule = string.Join(';', parts);

        // Determine DueDateTime for new series: keep time component, shift date to newDate
        DateTime? newDueDateTime = null;
        if (original.DueDateTime.HasValue)
        {
            var t = original.DueDateTime.Value;
            newDueDateTime = new DateTime(
                newDate.Year, newDate.Month, newDate.Day,
                t.Hour, t.Minute, t.Second, t.Millisecond, t.Kind);
        }

        // Strip UNTIL/COUNT from the original RRULE to get a clean recurrence rule for the new series
        var newRrule = original.Rrule!.Split(';')
            .Where(p => !p.StartsWith("UNTIL=", StringComparison.OrdinalIgnoreCase)
                     && !p.StartsWith("COUNT=", StringComparison.OrdinalIgnoreCase))
            .ToList();
        // Remove the UNTIL we just added (we want the new series to be open-ended)
        var cleanRrule = string.Join(';', original.Rrule!.Split(';')
            .Where(p => !p.StartsWith("UNTIL=", StringComparison.OrdinalIgnoreCase)
                     && !p.StartsWith("COUNT=", StringComparison.OrdinalIgnoreCase)));

        var newTask = new TodoTask
        {
            ProjectId = original.ProjectId,
            CreatedById = original.CreatedById,
            AssignedToId = original.AssignedToId,
            Title = original.Title,
            Description = original.Description,
            Priority = original.Priority,
            DueDate = newDate,
            DueDateTime = newDueDateTime,
            Rrule = cleanRrule,
            SortOrder = original.SortOrder,
        };

        // Copy subtasks
        foreach (var sub in original.Subtasks.OrderBy(s => s.SortOrder))
        {
            newTask.Subtasks.Add(new Subtask
            {
                Title = sub.Title,
                IsCompleted = false,
                SortOrder = sub.SortOrder,
            });
        }

        db.Tasks.Add(newTask);
        await db.SaveChangesAsync();

        return (original, newTask);
    }

    public async Task ToggleOccurrenceSubtaskAsync(
        Guid seriesId, DateOnly occurrenceDate, Guid subtaskId, bool isCompleted)
    {
        var exception = await GetOrCreateExceptionAsync(seriesId, occurrenceDate);
        await db.SaveChangesAsync(); // Ensure exception is persisted

        var completion = await db.ExceptionSubtaskCompletions
            .FirstOrDefaultAsync(c => c.RecurrenceExceptionId == exception.Id && c.SubtaskId == subtaskId);

        if (completion is not null)
        {
            completion.IsCompleted = isCompleted;
        }
        else
        {
            db.ExceptionSubtaskCompletions.Add(new ExceptionSubtaskCompletion
            {
                RecurrenceExceptionId = exception.Id,
                SubtaskId = subtaskId,
                IsCompleted = isCompleted,
            });
        }

        await db.SaveChangesAsync();
    }

    private TaskResponse BuildOccurrenceResponse(TodoTask master, DateOnly occurrenceDate, RecurrenceException? exception)
    {
        var effectiveDueDate = exception?.OverriddenDueDate ?? occurrenceDate;
        var effectiveDueDateTime = exception?.OverriddenDueDateTime ?? master.DueDateTime;
        var effectiveTitle = exception?.Title ?? master.Title;
        var effectiveDescription = exception?.Description ?? master.Description;
        var effectivePriority = exception?.Priority ?? master.Priority;

        Guid? effectiveAssignedToId;
        string? effectiveAssignedToName;
        if (exception is { ClearAssignedTo: true })
        {
            effectiveAssignedToId = null;
            effectiveAssignedToName = null;
        }
        else if (exception?.AssignedToId is not null)
        {
            effectiveAssignedToId = exception.AssignedToId;
            effectiveAssignedToName = exception.AssignedTo?.DisplayName;
        }
        else
        {
            effectiveAssignedToId = master.AssignedToId;
            effectiveAssignedToName = master.AssignedTo?.DisplayName;
        }

        // Build subtask responses with per-occurrence completion state
        var subtaskCompletions = exception?.SubtaskCompletions
            ?.ToDictionary(c => c.SubtaskId, c => c.IsCompleted)
            ?? new Dictionary<Guid, bool>();

        var subtasks = master.Subtasks
            .OrderBy(s => s.SortOrder)
            .Select(s => new SubtaskResponse(
                s.Id,
                s.Title,
                subtaskCompletions.TryGetValue(s.Id, out var completed) ? completed : false,
                s.SortOrder))
            .ToList();

        var tags = master.TaskTags
            .Select(tt => new TagResponse(tt.Tag.Id, tt.Tag.Name, tt.Tag.Color))
            .ToList();

        var reminders = master.Reminders
            .Select(r => new ReminderResponse(r.Id, r.OffsetMinutes))
            .ToList();

        return new TaskResponse(
            master.Id,
            master.ProjectId,
            master.Project.Name,
            master.Project.Color,
            master.CreatedById,
            master.CreatedBy.DisplayName,
            effectiveAssignedToId,
            effectiveAssignedToName,
            effectiveTitle,
            effectiveDescription,
            effectivePriority,
            effectiveDueDate,
            effectiveDueDateTime,
            exception?.CompletedAt,
            master.Rrule,
            occurrenceDate,
            exception is not null,
            subtasks,
            tags,
            reminders,
            master.SortOrder,
            master.CreatedAt,
            master.UpdatedAt);
    }

    private async Task<RecurrenceException> GetOrCreateExceptionAsync(Guid seriesId, DateOnly occurrenceDate)
    {
        var exception = await db.RecurrenceExceptions
            .FirstOrDefaultAsync(e => e.TaskId == seriesId && e.OriginalDate == occurrenceDate);

        if (exception is not null) return exception;

        exception = new RecurrenceException
        {
            TaskId = seriesId,
            OriginalDate = occurrenceDate,
        };
        db.RecurrenceExceptions.Add(exception);
        return exception;
    }

    private static bool IsEmptyException(RecurrenceException e)
    {
        return !e.IsSkipped
            && e.CompletedAt is null
            && e.Title is null
            && e.Description is null
            && e.Priority is null
            && e.OverriddenDueDate is null
            && e.OverriddenDueDateTime is null
            && e.AssignedToId is null
            && !e.ClearAssignedTo;
    }

    internal static List<DateOnly> GetOccurrences(string rrule, DateOnly startDate, DateOnly rangeStart, DateOnly rangeEnd)
    {
        var recur = new RecurrencePattern(rrule);

        var calEvent = new CalendarEvent
        {
            DtStart = new CalDateTime(startDate.Year, startDate.Month, startDate.Day),
        };
        calEvent.RecurrenceRules.Add(recur);

        var calendar = new Ical.Net.Calendar();
        calendar.Events.Add(calEvent);

        var searchStart = new CalDateTime(rangeStart.Year, rangeStart.Month, rangeStart.Day);
        var rangeEndDt = rangeEnd.ToDateTime(TimeOnly.MaxValue);

        var occurrences = calendar.GetOccurrences(searchStart)
            .TakeWhile(o => o.Period.StartTime.Value <= rangeEndDt);

        return occurrences
            .Select(o => DateOnly.FromDateTime(o.Period.StartTime.Value))
            .Where(d => d >= rangeStart && d <= rangeEnd)
            .Distinct()
            .OrderBy(d => d)
            .ToList();
    }
}
