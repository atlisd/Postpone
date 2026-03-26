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
public class SmartListsController(IProjectAccessService access, TaskerDbContext db) : ControllerBase
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

        var tasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.CompletedAt == null && t.DueDate <= today)
            .OrderBy(t => t.DueDate == today ? 1 : 0)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.DueDateTime)
            .ThenBy(t => t.CreatedAt)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        return Ok(tasks);
    }

    [HttpGet("tomorrow")]
    public async Task<IActionResult> Tomorrow()
    {
        var userId = User.GetUserId();
        var tomorrow = (await GetUserTodayAsync(userId)).AddDays(1);

        var tasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.CompletedAt == null && t.DueDate == tomorrow)
            .OrderByDescending(t => t.Priority)
            .ThenBy(t => t.DueDateTime)
            .ThenBy(t => t.CreatedAt)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        return Ok(tasks);
    }

    [HttpGet("next7days")]
    public async Task<IActionResult> Next7Days()
    {
        var userId = User.GetUserId();
        var today = await GetUserTodayAsync(userId);
        var endDate = today.AddDays(7);

        var tasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.CompletedAt == null && t.DueDate >= today && t.DueDate <= endDate)
            .OrderBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.CreatedAt)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        return Ok(tasks);
    }

    [HttpGet("all")]
    public async Task<IActionResult> All()
    {
        var userId = User.GetUserId();

        var tasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.CompletedAt == null)
            .OrderBy(t => t.Project.Name)
            .ThenBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        return Ok(tasks);
    }

    [HttpGet("assigned-to-me")]
    public async Task<IActionResult> AssignedToMe()
    {
        var userId = User.GetUserId();

        var tasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.CompletedAt == null && t.AssignedToId == userId)
            .OrderBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        return Ok(tasks);
    }

}
