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

        var defaultTimezone = Environment.GetEnvironmentVariable("DEFAULT_TIMEZONE") ?? "UTC";
        var user = new User
        {
            Email = request.Email,
            EmailNormalized = request.Email.ToUpperInvariant(),
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            DisplayName = request.DisplayName,
            IsAdmin = true,
            MustChangePassword = false,
            Timezone = defaultTimezone
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

        return Ok(new { message = "Setup complete" });
    }

    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var result = await authService.LoginAsync(request);
        if (result is null)
            return Unauthorized(new { message = "Invalid email or password" });

        SetRefreshTokenCookie(result.RefreshToken);
        return Ok(new { result.AccessToken, result.ExpiresIn, result.MustChangePassword });
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh()
    {
        var refreshToken = Request.Cookies["refreshToken"];
        if (refreshToken is null)
            return Unauthorized(new { message = "No refresh token" });

        var result = await authService.RefreshAsync(refreshToken);
        if (result is null)
            return Unauthorized(new { message = "Invalid or expired refresh token" });

        SetRefreshTokenCookie(result.RefreshToken);
        return Ok(new { result.AccessToken, result.ExpiresIn, result.MustChangePassword });
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var refreshToken = Request.Cookies["refreshToken"];
        if (refreshToken is not null)
            await authService.RevokeRefreshTokenAsync(refreshToken);

        Response.Cookies.Delete("refreshToken", new CookieOptions { Path = "/" });
        Response.Cookies.Delete("refreshToken", new CookieOptions { Path = "/api/auth" });
        return NoContent();
    }

    private void SetRefreshTokenCookie(string token)
    {
        Response.Cookies.Append("refreshToken", token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Expires = DateTimeOffset.UtcNow.AddDays(365),
            Path = "/"
        });
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

    [AllowAnonymous]
    [HttpGet("validate-token")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ValidateToken([FromQuery] string token, [FromQuery] string type)
    {
        if (string.IsNullOrEmpty(token) || (type != "invitation" && type != "password-reset"))
            return Ok(new ValidateTokenResponse(false, null, null));

        var (isValid, email, displayName) = await authService.ValidateTokenAsync(token, type);
        return Ok(new ValidateTokenResponse(isValid, email, displayName));
    }

    [AllowAnonymous]
    [HttpPost("accept-invitation")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> AcceptInvitation([FromBody] AcceptInvitationRequest request)
    {
        var success = await authService.AcceptInvitationAsync(request.Token, request.NewPassword);
        if (!success)
            return BadRequest(new { message = "Invalid or expired invitation link" });

        return NoContent();
    }

    [AllowAnonymous]
    [HttpPost("reset-password")]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        var success = await authService.ResetPasswordAsync(request.Token, request.NewPassword);
        if (!success)
            return BadRequest(new { message = "Invalid or expired password reset link" });

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
