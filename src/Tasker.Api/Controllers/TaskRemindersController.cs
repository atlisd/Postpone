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
public class TaskRemindersController(TaskerDbContext db, IProjectAccessService access, ISyncService sync) : ControllerBase
{
    [HttpPost("api/tasks/{taskId:guid}/reminders")]
    public async Task<IActionResult> Add(Guid taskId, [FromBody] AddReminderRequest request)
    {
        var userId = User.GetUserId();
        var task = await db.Tasks.FirstOrDefaultAsync(t => t.Id == taskId && !t.IsDeleted);
        if (task is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, task.ProjectId))
            return Forbid();

        if (request.OffsetMinutes < 0)
            return BadRequest("OffsetMinutes must be 0 or greater.");
        if (!task.DueDateTime.HasValue)
            return BadRequest("Reminders can only be added to tasks with a due time.");

        var duplicate = await db.TaskReminders
            .AnyAsync(r => r.TaskId == taskId && r.OffsetMinutes == request.OffsetMinutes);
        if (duplicate)
            return Conflict("A reminder with this offset already exists for this task.");

        var reminder = new TaskReminder
        {
            TaskId = taskId,
            OffsetMinutes = request.OffsetMinutes,
        };
        db.TaskReminders.Add(reminder);
        await db.SaveChangesAsync();

        var result = await db.Tasks.Where(t => t.Id == taskId).Select(TaskResponse.Projection).FirstAsync();
        await sync.TaskUpdated(task.ProjectId, result);

        return Created($"/api/tasks/{taskId}/reminders/{reminder.Id}",
            new ReminderResponse(reminder.Id, reminder.OffsetMinutes));
    }

    [HttpDelete("api/tasks/{taskId:guid}/reminders/{id:guid}")]
    public async Task<IActionResult> Delete(Guid taskId, Guid id)
    {
        var userId = User.GetUserId();
        var reminder = await db.TaskReminders
            .Include(r => r.Task)
            .FirstOrDefaultAsync(r => r.Id == id && r.TaskId == taskId);
        if (reminder is null) return NotFound();
        if (!await access.CanEditProjectAsync(userId, reminder.Task.ProjectId))
            return Forbid();

        db.TaskReminders.Remove(reminder);
        await db.SaveChangesAsync();

        var result = await db.Tasks.Where(t => t.Id == taskId).Select(TaskResponse.Projection).FirstAsync();
        await sync.TaskUpdated(reminder.Task.ProjectId, result);

        return NoContent();
    }
}
