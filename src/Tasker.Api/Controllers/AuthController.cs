using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Auth;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(IAuthService authService, TaskerDbContext db) : ControllerBase
{
    [HttpGet("setup-status")]
    [AllowAnonymous]
    public async Task<IActionResult> GetSetupStatus()
    {
        var hasUsers = await db.Users.AnyAsync();
        return Ok(new SetupStatusResponse(!hasUsers));
    }

    [HttpPost("setup")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Setup([FromBody] SetupRequest request)
    {
        if (await db.Users.AnyAsync())
            return Conflict(new { message = "Setup has already been completed" });

        var user = new User
        {
            Email = request.Email,
            EmailNormalized = request.Email.ToUpperInvariant(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            DisplayName = request.DisplayName,
            IsAdmin = true,
            MustChangePassword = false
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        return Ok(new { message = "Setup complete" });
    }

    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var result = await authService.LoginAsync(request);
        if (result is null)
            return Unauthorized(new { message = "Invalid email or password" });

        return Ok(result);
    }

    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
    {
        var result = await authService.RefreshAsync(request.RefreshToken);
        if (result is null)
            return Unauthorized(new { message = "Invalid or expired refresh token" });

        return Ok(result);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest request)
    {
        await authService.RevokeRefreshTokenAsync(request.RefreshToken);
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetProfile()
    {
        var userId = User.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        return Ok(new UserProfileResponse(
            user.Id, user.Email, user.DisplayName, user.AvatarUrl,
            user.Timezone, user.PushoverUserKey, user.IsAdmin, user.MustChangePassword));
    }

    [Authorize]
    [HttpPut("me")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userId = User.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        if (request.DisplayName is not null) user.DisplayName = request.DisplayName;
        if (request.Timezone is not null) user.Timezone = request.Timezone;
        if (request.AvatarUrl is not null) user.AvatarUrl = request.AvatarUrl;

        await db.SaveChangesAsync();

        return Ok(new UserProfileResponse(
            user.Id, user.Email, user.DisplayName, user.AvatarUrl,
            user.Timezone, user.PushoverUserKey, user.IsAdmin, user.MustChangePassword));
    }

    [Authorize]
    [HttpPut("me/password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        var userId = User.GetUserId();
        var success = await authService.ChangePasswordAsync(userId, request.CurrentPassword, request.NewPassword);

        if (!success)
            return BadRequest(new { message = "Current password is incorrect" });

        return NoContent();
    }

    [Authorize]
    [HttpPut("me/pushover")]
    public async Task<IActionResult> SetPushoverKey([FromBody] SetPushoverKeyRequest request)
    {
        var userId = User.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return NotFound();

        user.PushoverUserKey = request.UserKey;
        await db.SaveChangesAsync();

        return NoContent();
    }
}
