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

        var query = db.Tasks
            .Where(t => t.ProjectId == projectId && !t.IsDeleted)
            .Where(t => t.Rrule == null || t.RecurrenceParentId != null); // show instances, not templates

        if (!includeCompleted)
            query = query.Where(t => t.CompletedAt == null);

        var tasks = await query
            .OrderBy(t => t.DueDate.HasValue ? 0 : 1)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ThenBy(t => t.CreatedAt)
            .Select(TaskResponse.Projection)
            .ToListAsync();

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
        if (request.DueDate.HasValue) task.DueDate = request.DueDate.Value;
        if (request.DueDateTime.HasValue) task.DueDateTime = request.DueDateTime.Value;
        if (request.AssignedToId.HasValue) task.AssignedToId = request.AssignedToId.Value;

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

    private async Task<TaskResponse> GetTaskResponse(Guid taskId)
    {
        return await db.Tasks
            .Where(t => t.Id == taskId)
            .Select(TaskResponse.Projection)
            .FirstAsync();
    }
}
