using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Users;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController(TaskerDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.GetUserId();

        var users = await db.Users
            .Where(u => u.Id != userId)
            .OrderBy(u => u.DisplayName)
            .Select(u => new UserSummaryResponse(u.Id, u.DisplayName, u.Email))
            .ToListAsync();

        return Ok(users);
    }
}
