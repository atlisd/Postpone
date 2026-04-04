using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Tasks;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

namespace Tasker.Api.Controllers;

[ApiController]
[Authorize]
public class TasksController(TaskerDbContext db, IProjectAccessService access, IRecurrenceService recurrenceService, ISyncService sync) : ControllerBase
{
    [HttpGet("api/projects/{projectId:guid}/tasks")]
    public async Task<IActionResult> ListByProject(Guid projectId, [FromQuery] bool includeCompleted = false)
    {
        var userId = User.GetUserId();
        if (!await access.CanAccessProjectAsync(userId, projectId))
            return NotFound();

        // Non-recurring tasks
        var regularQuery = db.Tasks
            .Where(t => t.ProjectId == projectId && !t.IsDeleted && t.Rrule == null);

        if (!includeCompleted)
            regularQuery = regularQuery.Where(t => t.CompletedAt == null);

        var regularTasks = await regularQuery
            .OrderBy(t => t.SortOrder)
            .ThenBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.CreatedAt)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        // Recurring tasks: expand to virtual instances
        var today = await GetUserTodayAsync(userId);
        var recurringQuery = db.Tasks
            .Where(t => t.ProjectId == projectId && !t.IsDeleted && t.Rrule != null);
        var allOccurrences = await recurrenceService.ExpandOccurrencesAsync(
            recurringQuery, today.AddYears(-1), today.AddDays(90));

        // Pick the next incomplete occurrence per series
        var nextOccurrences = allOccurrences
            .Where(o => o.CompletedAt == null)
            .GroupBy(o => o.Id)
            .Select(g => g.OrderBy(o => o.DueDate).First())
            .ToList();

        List<TaskResponse> completedOccurrences = [];
        if (includeCompleted)
        {
            completedOccurrences = allOccurrences
                .Where(o => o.CompletedAt != null)
                .ToList();
        }

        var tasks = regularTasks
            .Concat(nextOccurrences)
            .Concat(completedOccurrences)
            .OrderBy(t => t.SortOrder)
            .ThenBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.CreatedAt)
            .ToList();

        return Ok(tasks);
    }

    [HttpPost("api/projects/{projectId:guid}/tasks")]
    public async Task<IActionResult> Create(Guid projectId, [FromBody] CreateTaskRequest request)
    {
        var userId = User.GetUserId();
        if (!await access.CanEditProjectAsync(userId, projectId))
            return Forbid();

        var task = new TodoTask
        {
            ProjectId = projectId,
            CreatedById = userId,
            Title = request.Title,
            Description = request.Description ?? "",
            Priority = request.Priority ?? 0,
            DueDate = request.DueDate,
            DueDateTime = request.DueDateTime,
            AssignedToId = request.AssignedToId,
        };

        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        var result = await GetTaskResponse(task.Id);
        await sync.TaskCreated(projectId, result);
        return Created($"/api/tasks/{task.Id}", result);
    }

    [HttpGet("api/tasks/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanAccessProjectAsync(userId, task.ProjectId))
            return NotFound();

        var result = await GetTaskResponse(id);
        return Ok(result);
    }

    [HttpPut("api/tasks/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateTaskRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        if (request.Title is not null) task.Title = request.Title;
        if (request.Description is not null) task.Description = request.Description;
        if (request.Priority.HasValue) task.Priority = request.Priority.Value;
        if (request.ClearDueDate) task.DueDate = null;
        else if (request.DueDate.HasValue) task.DueDate = request.DueDate.Value;
        if (request.ClearDueDateTime) task.DueDateTime = null;
        else if (request.DueDateTime.HasValue) task.DueDateTime = request.DueDateTime.Value;
        if (request.ClearAssignedTo) task.AssignedToId = null;
        else if (request.AssignedToId.HasValue) task.AssignedToId = request.AssignedToId.Value;

        await db.SaveChangesAsync();

        var result = await GetTaskResponse(id);
        await sync.TaskUpdated(task.ProjectId, result);
        return Ok(result);
    }

    [HttpDelete("api/tasks/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        task.IsDeleted = true;
        await db.SaveChangesAsync();
        await sync.TaskDeleted(task.ProjectId, id);
        return NoContent();
    }

    [HttpPost("api/tasks/{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        task.CompletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var result = await GetTaskResponse(id);
        await sync.TaskUpdated(task.ProjectId, result);
        return Ok(result);
    }

    [HttpPost("api/tasks/{id:guid}/uncomplete")]
    public async Task<IActionResult> Uncomplete(Guid id)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        task.CompletedAt = null;
        await db.SaveChangesAsync();

        var result = await GetTaskResponse(id);
        await sync.TaskUpdated(task.ProjectId, result);
        return Ok(result);
    }

    [HttpPut("api/tasks/{id:guid}/move")]
    public async Task<IActionResult> Move(Guid id, [FromBody] MoveTaskRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();
        if (!await access.CanEditProjectAsync(userId, request.ProjectId))
            return Forbid();

        var oldProjectId = task.ProjectId;
        task.ProjectId = request.ProjectId;
        await db.SaveChangesAsync();

        var result = await GetTaskResponse(id);
        await sync.TaskDeleted(oldProjectId, id);
        await sync.TaskCreated(request.ProjectId, result);
        return Ok(result);
    }

    [HttpPost("api/projects/{projectId:guid}/tasks/reorder")]
    public async Task<IActionResult> ReorderTasks(Guid projectId, [FromBody] ReorderTasksRequest request)
    {
        var userId = User.GetUserId();
        if (!await access.CanEditProjectAsync(userId, projectId))
            return Forbid();

        var tasks = await db.Tasks
            .Where(t => request.OrderedIds.Contains(t.Id) && t.ProjectId == projectId && !t.IsDeleted)
            .ToListAsync();

        foreach (var task in tasks)
            task.SortOrder = request.OrderedIds.IndexOf(task.Id);

        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("api/tasks/{id:guid}/due-date")]
    public async Task<IActionResult> UpdateDueDate(Guid id, [FromBody] UpdateDueDateRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        task.DueDate = request.DueDate;
        await db.SaveChangesAsync();

        var result = await GetTaskResponse(id);
        await sync.TaskUpdated(task.ProjectId, result);
        return Ok(result);
    }

    [HttpPut("api/tasks/{id:guid}/recurrence")]
    public async Task<IActionResult> SetRecurrence(Guid id, [FromBody] SetRecurrenceRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        try
        {
            await recurrenceService.SetRecurrenceAsync(id, request.Rrule);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var result = await GetTaskResponse(id);
        return Ok(result);
    }

    [HttpDelete("api/tasks/{id:guid}/recurrence")]
    public async Task<IActionResult> RemoveRecurrence(Guid id)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        await recurrenceService.RemoveRecurrenceAsync(id);

        var result = await GetTaskResponse(id);
        return Ok(result);
    }

    // --- Occurrence-specific endpoints ---

    [HttpPost("api/tasks/{id:guid}/occurrences/{date}/complete")]
    public async Task<IActionResult> CompleteOccurrence(Guid id, DateOnly date)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted && t.Rrule != null);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        await recurrenceService.CompleteOccurrenceAsync(id, date);
        await sync.TaskUpdated(task.ProjectId, new { taskId = id, occurrenceDate = date });
        return NoContent();
    }

    [HttpPost("api/tasks/{id:guid}/occurrences/{date}/uncomplete")]
    public async Task<IActionResult> UncompleteOccurrence(Guid id, DateOnly date)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted && t.Rrule != null);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        await recurrenceService.UncompleteOccurrenceAsync(id, date);
        await sync.TaskUpdated(task.ProjectId, new { taskId = id, occurrenceDate = date });
        return NoContent();
    }

    [HttpDelete("api/tasks/{id:guid}/occurrences/{date}")]
    public async Task<IActionResult> SkipOccurrence(Guid id, DateOnly date)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted && t.Rrule != null);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        await recurrenceService.SkipOccurrenceAsync(id, date);
        await sync.TaskUpdated(task.ProjectId, new { taskId = id, occurrenceDate = date });
        return NoContent();
    }

    [HttpPut("api/tasks/{id:guid}/occurrences/{date}")]
    public async Task<IActionResult> EditOccurrence(Guid id, DateOnly date, [FromBody] EditOccurrenceRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted && t.Rrule != null);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        await recurrenceService.EditOccurrenceAsync(id, date, request);
        await sync.TaskUpdated(task.ProjectId, new { taskId = id, occurrenceDate = date });
        return NoContent();
    }

    [HttpPut("api/tasks/{id:guid}/occurrences/{date}/due-date")]
    public async Task<IActionResult> RescheduleOccurrence(Guid id, DateOnly date, [FromBody] RescheduleOccurrenceRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted && t.Rrule != null);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        await recurrenceService.RescheduleOccurrenceAsync(id, date, request.NewDate);
        await sync.TaskUpdated(task.ProjectId, new { taskId = id, occurrenceDate = date });
        return NoContent();
    }

    private async Task<TaskResponse> GetTaskResponse(Guid taskId)
    {
        return await db.Tasks
            .Where(t => t.Id == taskId)
            .Select(TaskResponse.Projection)
            .FirstAsync();
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
