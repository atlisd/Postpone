using Ical.Net;
using Ical.Net.CalendarComponents;
using Ical.Net.DataTypes;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public class RecurrenceService(TaskerDbContext db, ILogger<RecurrenceService> logger) : IRecurrenceService
{
    public async Task GenerateInstancesAsync(int horizonDays = 14)
    {
        var templates = await db.Tasks
            .Where(t => t.Rrule != null && t.RecurrenceParentId == null && !t.IsDeleted)
            .ToListAsync();

        foreach (var template in templates)
        {
            try
            {
                await GenerateForTemplate(template, horizonDays);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to generate instances for template {TaskId}", template.Id);
            }
        }

        await db.SaveChangesAsync();
    }

    public async Task GenerateInstancesForTemplateAsync(Guid templateTaskId, int horizonDays = 14)
    {
        var template = await db.Tasks
            .Include(t => t.Subtasks)
            .Include(t => t.TaskTags)
            .FirstOrDefaultAsync(t => t.Id == templateTaskId && t.Rrule != null && !t.IsDeleted);

        if (template is null) return;

        await GenerateForTemplate(template, horizonDays);
        await db.SaveChangesAsync();
    }

    public async Task SetRecurrenceAsync(Guid taskId, string rrule)
    {
        var task = await db.Tasks
            .Include(t => t.Subtasks)
            .Include(t => t.TaskTags)
            .FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);

        if (task is null) return;

        // Validate RRULE by parsing it
        try
        {
            var recur = new RecurrencePattern(rrule);
        }
        catch (Exception ex)
        {
            throw new ArgumentException($"Invalid RRULE: {rrule}", ex);
        }

        task.Rrule = rrule;

        // If this task was previously a normal task (not a template), it becomes one now.
        // Its due date becomes the recurrence start date.
        // Set the first due date if not set
        task.DueDate ??= DateOnly.FromDateTime(DateTime.UtcNow);

        await db.SaveChangesAsync();

        // Generate instances
        await GenerateForTemplate(task, 14);
        await db.SaveChangesAsync();
    }

    public async Task RemoveRecurrenceAsync(Guid taskId)
    {
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return;

        task.Rrule = null;

        // Delete all uncompleted future instances
        var futureInstances = await db.Tasks
            .Where(t => t.RecurrenceParentId == taskId && t.CompletedAt == null && !t.IsDeleted)
            .ToListAsync();

        foreach (var instance in futureInstances)
            instance.IsDeleted = true;

        await db.SaveChangesAsync();
    }

    private async Task GenerateForTemplate(TodoTask template, int horizonDays)
    {
        if (template.Rrule is null || template.DueDate is null) return;

        var startDate = template.DueDate.Value;
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var horizon = today.AddDays(horizonDays);

        // Get existing instance dates to avoid duplicates
        var existingDates = await db.Tasks
            .Where(t => t.RecurrenceParentId == template.Id && !t.IsDeleted)
            .Where(t => t.RecurrenceOriginDate != null)
            .Select(t => t.RecurrenceOriginDate!.Value)
            .ToHashSetAsync();

        // Parse RRULE and get occurrences
        var occurrences = GetOccurrences(template.Rrule, startDate, today, horizon);

        foreach (var occurrenceDate in occurrences)
        {
            if (existingDates.Contains(occurrenceDate)) continue;

            var instance = new TodoTask
            {
                ProjectId = template.ProjectId,
                CreatedById = template.CreatedById,
                AssignedToId = template.AssignedToId,
                Title = template.Title,
                Description = template.Description,
                Priority = template.Priority,
                DueDate = occurrenceDate,
                DueDateTime = template.DueDateTime,
                RecurrenceParentId = template.Id,
                RecurrenceOriginDate = occurrenceDate,
                Rrule = template.Rrule,
            };

            db.Tasks.Add(instance);

            // Clone subtasks
            if (template.Subtasks != null)
            {
                foreach (var sub in template.Subtasks)
                {
                    db.Subtasks.Add(new Subtask
                    {
                        TaskId = instance.Id,
                        Title = sub.Title,
                        SortOrder = sub.SortOrder,
                    });
                }
            }

            // Clone tags
            if (template.TaskTags != null)
            {
                foreach (var tt in template.TaskTags)
                {
                    db.TaskTags.Add(new TaskTag
                    {
                        TaskId = instance.Id,
                        TagId = tt.TagId,
                    });
                }
            }
        }
    }

    private static List<DateOnly> GetOccurrences(string rrule, DateOnly startDate, DateOnly rangeStart, DateOnly rangeEnd)
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
        var searchEnd = new CalDateTime(rangeEnd.Year, rangeEnd.Month, rangeEnd.Day);

        var rangeStartDt = rangeStart.ToDateTime(TimeOnly.MinValue);
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
