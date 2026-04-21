using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Tags;
using Tasker.Api.Models.Dtos.Tasks;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

namespace Tasker.Api.Controllers;

[ApiController]
[Authorize]
public class TagsController(TaskerDbContext db, IProjectAccessService access, ISyncService sync, IRecurrenceService recurrence) : ControllerBase
{
    [HttpGet("api/tags")]
    public async Task<IActionResult> List()
    {
        var userId = User.GetUserId();
        var tags = await db.Tags
            .Where(t => t.UserId == userId)
            .OrderBy(t => t.Name)
            .Select(t => new TagFullResponse(t.Id, t.Name, t.Color, t.CreatedAt,
                t.TaskTags.Count(tt => !tt.Task.IsDeleted && tt.Task.CompletedAt == null)))
            .ToListAsync();

        return Ok(tags);
    }

    [HttpGet("api/tags/{id:guid}/tasks")]
    public async Task<IActionResult> GetTasks(Guid id)
    {
        var userId = User.GetUserId();
        var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (tag is null) return NotFound();

        // Non-recurring tasks
        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.TaskTags.Any(tt => tt.TagId == id) && !t.IsDeleted && t.CompletedAt == null && t.Rrule == null)
            .OrderBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.CreatedAt)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        // Recurring tasks with this tag: expand and pick next incomplete per series
        var today = await GetUserTodayAsync(userId);
        var recurringQuery = access.GetAccessibleTasks(userId)
            .Where(t => t.TaskTags.Any(tt => tt.TagId == id) && !t.IsDeleted && t.Rrule != null);
        var allOccurrences = await recurrence.ExpandOccurrencesAsync(
            recurringQuery, today.AddYears(-1), today.AddDays(90));
        var nextOccurrences = allOccurrences
            .Where(o => o.CompletedAt == null)
            .GroupBy(o => o.Id)
            .Select(g => g.Where(o => o.DueDate >= today).OrderBy(o => o.DueDate).FirstOrDefault()
                         ?? g.OrderByDescending(o => o.DueDate).First())
            .ToList();

        var tasks = regularTasks.Concat(nextOccurrences)
            .OrderBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.CreatedAt)
            .ToList();

        return Ok(tasks);
    }

    [HttpPost("api/tags")]
    public async Task<IActionResult> Create([FromBody] CreateTagRequest request)
    {
        var userId = User.GetUserId();

        var exists = await db.Tags.AnyAsync(t => t.UserId == userId && t.Name == request.Name);
        if (exists)
            return Conflict(new { message = "Tag with this name already exists" });

        var tag = new Tag
        {
            UserId = userId,
            Name = request.Name,
            Color = request.Color ?? "#888888"
        };

        db.Tags.Add(tag);
        await db.SaveChangesAsync();

        return Created($"/api/tags/{tag.Id}",
            new TagFullResponse(tag.Id, tag.Name, tag.Color, tag.CreatedAt));
    }

    [HttpPut("api/tags/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTagRequest request)
    {
        var userId = User.GetUserId();
        var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (tag is null) return NotFound();

        if (request.Name is not null) tag.Name = request.Name;
        if (request.Color is not null) tag.Color = request.Color;

        await db.SaveChangesAsync();
        return Ok(new TagFullResponse(tag.Id, tag.Name, tag.Color, tag.CreatedAt));
    }

    [HttpDelete("api/tags/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (tag is null) return NotFound();

        db.Tags.Remove(tag);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("api/tasks/{taskId:guid}/tags")]
    public async Task<IActionResult> AddTagToTask(Guid taskId, [FromBody] AddTagToTaskRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        var tag = await db.Tags.FindAsync(request.TagId);
        if (tag is null) return NotFound();

        var exists = await db.TaskTags.AnyAsync(tt => tt.TaskId == taskId && tt.TagId == request.TagId);
        if (exists) return Ok();

        db.TaskTags.Add(new TaskTag { TaskId = taskId, TagId = request.TagId });
        await db.SaveChangesAsync();

        var result = await db.Tasks.Where(t => t.Id == taskId).Select(TaskResponse.Projection).FirstAsync();
        await sync.TaskUpdated(task.ProjectId, result);
        return NoContent();
    }

    [HttpDelete("api/tasks/{taskId:guid}/tags/{tagId:guid}")]
    public async Task<IActionResult> RemoveTagFromTask(Guid taskId, Guid tagId)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        var taskTag = await db.TaskTags.FirstOrDefaultAsync(tt => tt.TaskId == taskId && tt.TagId == tagId);
        if (taskTag is null) return NotFound();

        db.TaskTags.Remove(taskTag);
        await db.SaveChangesAsync();

        var result = await db.Tasks.Where(t => t.Id == taskId).Select(TaskResponse.Projection).FirstAsync();
        await sync.TaskUpdated(task.ProjectId, result);
        return NoContent();
    }

    private async Task<DateOnly> GetUserTodayAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId);
        TimeZoneInfo tz = TimeZoneInfo.Utc;
        if (user?.Timezone is not null)
            try { tz = TimeZoneInfo.FindSystemTimeZoneById(user.Timezone); } catch { }
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz));
    }
}
