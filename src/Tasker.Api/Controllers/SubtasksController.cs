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
public class SubtasksController(TaskerDbContext db, IProjectAccessService access, ISyncService sync) : ControllerBase
{
    [HttpGet("api/tasks/{taskId:guid}/subtasks")]
    public async Task<IActionResult> List(Guid taskId)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanAccessProjectAsync(userId, task.ProjectId))
            return NotFound();

        var subtasks = await db.Subtasks
            .Where(s => s.TaskId == taskId)
            .OrderBy(s => s.SortOrder)
            .Select(s => new SubtaskResponse(s.Id, s.Title, s.IsCompleted, s.SortOrder))
            .ToListAsync();

        return Ok(subtasks);
    }

    [HttpPost("api/tasks/{taskId:guid}/subtasks")]
    public async Task<IActionResult> Create(Guid taskId, [FromBody] CreateSubtaskRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        var maxOrder = await db.Subtasks
            .Where(s => s.TaskId == taskId)
            .MaxAsync(s => (double?)s.SortOrder) ?? 0;

        var subtask = new Subtask
        {
            TaskId = taskId,
            Title = request.Title,
            SortOrder = maxOrder + 1
        };

        db.Subtasks.Add(subtask);
        await db.SaveChangesAsync();
        await sync.SubtaskUpdated(task.ProjectId, taskId);

        return Created($"/api/subtasks/{subtask.Id}",
            new SubtaskResponse(subtask.Id, subtask.Title, subtask.IsCompleted, subtask.SortOrder));
    }

    [HttpPut("api/subtasks/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSubtaskRequest request)
    {
        var userId = User.GetUserId();
        var subtask = await db.Subtasks.Include(s => s.Task).FirstOrDefaultAsync(s => s.Id == id);
        if (subtask is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, subtask.Task.ProjectId))
            return Forbid();

        if (request.Title is not null) subtask.Title = request.Title;
        if (request.IsCompleted.HasValue) subtask.IsCompleted = request.IsCompleted.Value;

        await db.SaveChangesAsync();
        await sync.SubtaskUpdated(subtask.Task.ProjectId, subtask.TaskId);

        return Ok(new SubtaskResponse(subtask.Id, subtask.Title, subtask.IsCompleted, subtask.SortOrder));
    }

    [HttpDelete("api/subtasks/{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        var subtask = await db.Subtasks.Include(s => s.Task).FirstOrDefaultAsync(s => s.Id == id);
        if (subtask is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, subtask.Task.ProjectId))
            return Forbid();

        var projectId = subtask.Task.ProjectId;
        var taskId = subtask.TaskId;
        db.Subtasks.Remove(subtask);
        await db.SaveChangesAsync();
        await sync.SubtaskUpdated(projectId, taskId);
        return NoContent();
    }

    [HttpPut("api/tasks/{taskId:guid}/subtasks/reorder")]
    public async Task<IActionResult> Reorder(Guid taskId, [FromBody] ReorderSubtasksRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        var subtasks = await db.Subtasks
            .Where(s => s.TaskId == taskId)
            .ToDictionaryAsync(s => s.Id);

        foreach (var item in request.Items)
        {
            if (subtasks.TryGetValue(item.Id, out var subtask))
                subtask.SortOrder = item.SortOrder;
        }

        await db.SaveChangesAsync();
        return NoContent();
    }
}
