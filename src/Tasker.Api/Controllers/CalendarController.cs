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
public class CalendarController(IProjectAccessService access, IRecurrenceService recurrence) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetCalendarTasks(
        [FromQuery] DateOnly start,
        [FromQuery] DateOnly end)
    {
        var userId = User.GetUserId();

        // Non-recurring tasks in date range
        var regularTasks = await access.GetAccessibleTasks(userId)
            .Where(t => t.Rrule == null && !t.HideFromCalendar &&
                t.DueDate <= end &&
                (t.EndDate == null ? t.DueDate >= start : t.EndDate >= start))
            .OrderBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .Select(TaskResponse.Projection)
            .ToListAsync();

        // Recurring task occurrences in date range
        var recurringQuery = access.GetAccessibleTasks(userId).Where(t => t.Rrule != null && !t.HideFromCalendar);
        var virtualInstances = await recurrence.ExpandOccurrencesAsync(recurringQuery, start, end);

        var all = regularTasks.Concat(virtualInstances)
            .OrderBy(t => t.DueDate)
            .ThenByDescending(t => t.Priority)
            .ToList();

        return Ok(all);
    }
}
