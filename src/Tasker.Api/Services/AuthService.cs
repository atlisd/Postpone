using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Models.Dtos.Auth;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public class AuthService(TaskerDbContext db, ITokenService tokenService) : IAuthService
{
    private const int RefreshTokenExpirationDays = 30;

    public async Task<AuthResponse?> LoginAsync(LoginRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToUpperInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.EmailNormalized == normalizedEmail);

        if (user is null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
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

        if (!BCrypt.Net.BCrypt.Verify(currentPassword, user.PasswordHash))
            return false;

        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        user.MustChangePassword = false;
        await db.SaveChangesAsync();

        return true;
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
