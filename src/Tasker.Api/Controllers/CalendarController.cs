using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Tasks;
using Tasker.Api.Services;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/calendar")]
[Authorize]
public class CalendarController(IProjectAccessService access) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetCalendarTasks(
        [FromQuery] DateOnly start,
        [FromQuery] DateOnly end)
    {
        var userId = User.GetUserId();

        var tasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.DueDate >= start && t.DueDate <= end)
            .OrderBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        return Ok(tasks);
    }
}
