using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Tasks;
using Tasker.Api.Services;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/smart-lists")]
[Authorize]
public class SmartListsController(IProjectAccessService access, IRecurrenceService recurrence, TaskerDbContext db) : ControllerBase
{
    private async Task<DateOnly> GetUserTodayAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId);
        TimeZoneInfo tz = TimeZoneInfo.Utc;
        if (user?.Timezone is not null)
            try { tz = TimeZoneInfo.FindSystemTimeZoneById(user.Timezone); } catch { }
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
    }

    [HttpGet("today")]
    public async Task<IActionResult> Today()
    {
        var userId = User.GetUserId();
        var today = await GetUserTodayAsync(userId);

        // Non-recurring tasks due today or overdue
        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule == null && t.CompletedAt == null && t.DueDate <= today)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        // Recurring task occurrences: expand from 1 year ago to today to catch overdue
        var overdueSince = today.AddYears(-1);
        var recurringQuery = access.GetAccessibleTasks(userId).Where(t => t.Rrule != null);
        var virtualInstances = await recurrence.ExpandOccurrencesAsync(recurringQuery, overdueSince, today);
        var filteredInstances = virtualInstances
            .Where(v => v.CompletedAt == null && v.DueDate <= today)
            .ToList();

        var all = regularTasks.Concat(filteredInstances)
            .OrderBy(t => t.DueDate == today ? 1 : 0)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.DueDateTime)
            .ThenBy(t => t.CreatedAt)
            .ToList();

        return Ok(all);
    }

    [HttpGet("tomorrow")]
    public async Task<IActionResult> Tomorrow()
    {
        var userId = User.GetUserId();
        var tomorrow = (await GetUserTodayAsync(userId)).AddDays(1);

        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule == null && t.CompletedAt == null && t.DueDate == tomorrow)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        var recurringQuery = access.GetAccessibleTasks(userId).Where(t => t.Rrule != null);
        var virtualInstances = await recurrence.ExpandOccurrencesAsync(recurringQuery, tomorrow, tomorrow);
        var filteredInstances = virtualInstances.Where(v => v.CompletedAt == null && v.DueDate == tomorrow).ToList();

        var all = regularTasks.Concat(filteredInstances)
            .OrderByDescending(t => t.Priority)
            .ThenBy(t => t.DueDateTime)
            .ThenBy(t => t.CreatedAt)
            .ToList();

        return Ok(all);
    }

    [HttpGet("next7days")]
    public async Task<IActionResult> Next7Days()
    {
        var userId = User.GetUserId();
        var today = await GetUserTodayAsync(userId);
        var endDate = today.AddDays(7);

        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule == null && t.CompletedAt == null && t.DueDate >= today && t.DueDate <= endDate)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        var recurringQuery = access.GetAccessibleTasks(userId).Where(t => t.Rrule != null);
        var virtualInstances = await recurrence.ExpandOccurrencesAsync(recurringQuery, today, endDate);
        var filteredInstances = virtualInstances.Where(v => v.CompletedAt == null && v.DueDate >= today && v.DueDate <= endDate).ToList();

        var all = regularTasks.Concat(filteredInstances)
            .OrderBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.CreatedAt)
            .ToList();

        return Ok(all);
    }

    [HttpGet("all")]
    public async Task<IActionResult> All()
    {
        var userId = User.GetUserId();
        var today = await GetUserTodayAsync(userId);

        // Non-recurring incomplete tasks
        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule == null && t.CompletedAt == null)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        // Expand recurring tasks for next 90 days
        var recurringQuery = access.GetAccessibleTasks(userId).Where(t => t.Rrule != null);
        var virtualInstances = await recurrence.ExpandOccurrencesAsync(recurringQuery, today, today.AddDays(90));
        var filteredInstances = virtualInstances.Where(v => v.CompletedAt == null).ToList();

        var all = regularTasks.Concat(filteredInstances)
            .OrderBy(t => t.ProjectName)
            .ThenBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ToList();

        return Ok(all);
    }

    [HttpGet("priority")]
    public async Task<IActionResult> Priority()
    {
        var userId = User.GetUserId();
        var today = await GetUserTodayAsync(userId);

        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule == null && t.CompletedAt == null && t.Priority > 0)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        var recurringQuery = access.GetAccessibleTasks(userId).Where(t => t.Rrule != null && t.Priority > 0);
        var virtualInstances = await recurrence.ExpandOccurrencesAsync(recurringQuery, today, today.AddDays(90));
        var filteredInstances = virtualInstances.Where(v => v.CompletedAt == null && v.Priority > 0).ToList();

        var all = regularTasks.Concat(filteredInstances)
            .OrderByDescending(t => t.Priority)
            .ThenBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenBy(t => t.ProjectName)
            .ToList();

        return Ok(all);
    }

    [HttpGet("assigned-to-me")]
    public async Task<IActionResult> AssignedToMe()
    {
        var userId = User.GetUserId();
        var today = await GetUserTodayAsync(userId);

        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule == null && t.CompletedAt == null && t.AssignedToId == userId)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        // Recurring tasks assigned to me — expand next 90 days
        var recurringQuery = access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule != null && t.AssignedToId == userId);
        var virtualInstances = await recurrence.ExpandOccurrencesAsync(recurringQuery, today, today.AddDays(90));
        var filteredInstances = virtualInstances
            .Where(v => v.CompletedAt == null && v.AssignedToId == userId)
            .ToList();

        var all = regularTasks.Concat(filteredInstances)
            .OrderBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ToList();

        return Ok(all);
    }
}
