using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Admin;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize]
public class AdminController(TaskerDbContext db) : ControllerBase
{
    [HttpGet("users")]
    public async Task<IActionResult> ListUsers()
    {
        if (!User.IsAdmin()) return Forbid();

        var users = await db.Users
            .OrderBy(u => u.CreatedAt)
            .Select(u => new AdminUserResponse(
                u.Id, u.Email, u.DisplayName, u.IsAdmin, u.MustChangePassword, u.CreatedAt))
            .ToListAsync();

        return Ok(users);
    }

    [HttpPost("users")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        if (!User.IsAdmin()) return Forbid();

        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var exists = await db.Users.AnyAsync(u => u.EmailNormalized == normalizedEmail);
        if (exists)
            return Conflict(new { message = "A user with this email already exists" });

        var user = new User
        {
            Email = request.Email.Trim(),
            EmailNormalized = normalizedEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            DisplayName = request.DisplayName,
            MustChangePassword = true,
            IsAdmin = false
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        db.Projects.Add(new Project
        {
            OwnerId = user.Id,
            Name = "Inbox",
            Color = "#6366f1",
            Icon = "inbox",
            IsInbox = true
        });
        await db.SaveChangesAsync();

        return Created($"/api/admin/users/{user.Id}", new AdminUserResponse(
            user.Id, user.Email, user.DisplayName, user.IsAdmin, user.MustChangePassword, user.CreatedAt));
    }

    [HttpPut("users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, [FromBody] UpdateUserRequest request)
    {
        if (!User.IsAdmin()) return Forbid();

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (request.DisplayName is not null) user.DisplayName = request.DisplayName;
        if (request.IsAdmin.HasValue) user.IsAdmin = request.IsAdmin.Value;
        if (request.Password is not null)
        {
            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
            user.MustChangePassword = true;
        }

        await db.SaveChangesAsync();

        return Ok(new AdminUserResponse(
            user.Id, user.Email, user.DisplayName, user.IsAdmin, user.MustChangePassword, user.CreatedAt));
    }

    [HttpDelete("users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        if (!User.IsAdmin()) return Forbid();

        // Prevent self-deletion
        if (id == User.GetUserId())
            return BadRequest(new { message = "Cannot delete your own account" });

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        db.Users.Remove(user);
        await db.SaveChangesAsync();

        return NoContent();
    }
}
