using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Models.Dtos.Auth;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public class AuthService(TaskerDbContext db, ITokenService tokenService) : IAuthService
{
    private const int RefreshTokenExpirationDays = 365;

    public async Task<AuthResponse?> LoginAsync(LoginRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.EmailNormalized == normalizedEmail);

        if (user is null || user.PasswordHash is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            return null;

        return await GenerateTokensAsync(user);
    }

    public async Task<AuthResponse?> RefreshAsync(string refreshToken)
    {
        var hash = tokenService.HashToken(refreshToken);
        var stored = await db.RefreshTokens
            .Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.TokenHash == hash);

        if (stored is null)
            return null;

        // Token reuse detection: if revoked token is presented, revoke all user tokens
        if (stored.RevokedAt.HasValue)
        {
            await RevokeAllUserTokensAsync(stored.UserId);
            return null;
        }

        if (stored.ExpiresAt < DateTime.UtcNow)
            return null;

        // Rotate: revoke old, issue new
        stored.RevokedAt = DateTime.UtcNow;
        var response = await GenerateTokensAsync(stored.User);
        await db.SaveChangesAsync();

        return response;
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken)
    {
        var hash = tokenService.HashToken(refreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(rt => rt.TokenHash == hash);
        if (stored is not null)
        {
            stored.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    public async Task RevokeAllUserTokensAsync(Guid userId)
    {
        var tokens = await db.RefreshTokens
            .Where(rt => rt.UserId == userId && rt.RevokedAt == null)
            .ToListAsync();

        var now = DateTime.UtcNow;
        foreach (var token in tokens)
            token.RevokedAt = now;

        await db.SaveChangesAsync();
    }

    public async Task<bool> ChangePasswordAsync(Guid userId, string currentPassword, string newPassword)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null)
            return false;

        if (user.PasswordHash is null || !BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash))
            return false;

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.MustChangePassword = false;
        await db.SaveChangesAsync();

        return true;
    }

    public async Task<bool> AcceptInvitationAsync(string token, string newPassword)
    {
        var hash = tokenService.HashToken(token);
        var user = await db.Users.FirstOrDefaultAsync(u => u.InvitationTokenHash == hash);

        if (user is null || user.InvitationExpiresAt < DateTime.UtcNow)
            return false;

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.InvitationTokenHash = null;
        user.InvitationExpiresAt = null;
        user.MustChangePassword = false;
        await db.SaveChangesAsync();

        return true;
    }

    public async Task<bool> ResetPasswordAsync(string token, string newPassword)
    {
        var hash = tokenService.HashToken(token);
        var user = await db.Users.FirstOrDefaultAsync(u => u.PasswordResetTokenHash == hash);

        if (user is null || user.PasswordResetExpiresAt < DateTime.UtcNow)
            return false;

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.PasswordResetTokenHash = null;
        user.PasswordResetExpiresAt = null;
        user.MustChangePassword = false;
        await db.SaveChangesAsync();

        return true;
    }

    public async Task<(bool isValid, string? email, string? displayName)> ValidateTokenAsync(string token, string type)
    {
        var hash = tokenService.HashToken(token);
        User? user = type switch
        {
            "invitation" => await db.Users.FirstOrDefaultAsync(u => u.InvitationTokenHash == hash),
            "password-reset" => await db.Users.FirstOrDefaultAsync(u => u.PasswordResetTokenHash == hash),
            _ => null
        };

        if (user is null) return (false, null, null);

        var expired = type switch
        {
            "invitation" => user.InvitationExpiresAt < DateTime.UtcNow,
            "password-reset" => user.PasswordResetExpiresAt < DateTime.UtcNow,
            _ => true
        };

        if (expired) return (false, null, null);

        return (true, user.Email, user.DisplayName);
    }

    private async Task<AuthResponse> GenerateTokensAsync(User user)
    {
        var accessToken = tokenService.GenerateAccessToken(user);
        var (refreshToken, refreshHash) = tokenService.GenerateRefreshToken();

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = refreshHash,
            ExpiresAt = DateTime.UtcNow.AddDays(RefreshTokenExpirationDays)
        });

        await db.SaveChangesAsync();

        return new AuthResponse(accessToken, refreshToken, 900, user.MustChangePassword);
    }
}
