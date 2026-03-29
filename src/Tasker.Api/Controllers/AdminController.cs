using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Admin;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize]
public class AdminController(TaskerDbContext db, ITokenService tokenService) : ControllerBase
{
    [HttpGet("users")]
    public async Task<IActionResult> ListUsers()
    {
        if (!User.IsAdmin()) return Forbid();

        var users = await db.Users
            .OrderBy(u => u.CreatedAt)
            .Select(u => new AdminUserResponse(
                u.Id, u.Email, u.DisplayName, u.IsAdmin, u.MustChangePassword, u.CreatedAt, u.PasswordHash != null))
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

        var (token, hash) = tokenService.GenerateSecureToken();
        var defaultTimezone = Environment.GetEnvironmentVariable("DEFAULT_TIMEZONE") ?? "UTC";
        var defaultLocale = Environment.GetEnvironmentVariable("DEFAULT_LOCALE") ?? "en";
        var user = new User
        {
            Email = request.Email.Trim(),
            EmailNormalized = normalizedEmail,
            DisplayName = request.DisplayName,
            MustChangePassword = false,
            IsAdmin = false,
            Timezone = defaultTimezone,
            Locale = defaultLocale,
            InvitationTokenHash = hash,
            InvitationExpiresAt = DateTime.UtcNow.AddHours(1)
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

        return Created($"/api/admin/users/{user.Id}", new CreateUserResponse(
            user.Id, user.Email, user.DisplayName, user.IsAdmin, user.MustChangePassword,
            user.CreatedAt, user.PasswordHash != null, token));
    }

    [HttpPost("users/{id:guid}/invitation")]
    public async Task<IActionResult> RegenerateInvitation(Guid id)
    {
        if (!User.IsAdmin()) return Forbid();

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var (token, hash) = tokenService.GenerateSecureToken();
        user.InvitationTokenHash = hash;
        user.InvitationExpiresAt = DateTime.UtcNow.AddHours(1);

        await db.SaveChangesAsync();

        return Ok(new GenerateLinkResponse(token));
    }

    [HttpPost("users/{id:guid}/password-reset-link")]
    public async Task<IActionResult> GeneratePasswordResetLink(Guid id)
    {
        if (!User.IsAdmin()) return Forbid();

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        var (token, hash) = tokenService.GenerateSecureToken();
        user.PasswordResetTokenHash = hash;
        user.PasswordResetExpiresAt = DateTime.UtcNow.AddHours(1);

        await db.SaveChangesAsync();

        return Ok(new GenerateLinkResponse(token));
    }

    [HttpPut("users/{id:guid}")]
    public async Task<IActionResult> UpdateUser(Guid id, [FromBody] UpdateUserRequest request)
    {
        if (!User.IsAdmin()) return Forbid();

        var user = await db.Users.FindAsync(id);
        if (user is null) return NotFound();

        if (request.DisplayName is not null) user.DisplayName = request.DisplayName;
        if (request.IsAdmin.HasValue) user.IsAdmin = request.IsAdmin.Value;

        await db.SaveChangesAsync();

        return Ok(new AdminUserResponse(
            user.Id, user.Email, user.DisplayName, user.IsAdmin, user.MustChangePassword,
            user.CreatedAt, user.PasswordHash != null));
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
