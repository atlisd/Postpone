namespace Tasker.Api.Models.Dtos.Auth;

public record LoginRequest(string Email, string Password);

public record AuthResponse(string AccessToken, string RefreshToken, int ExpiresIn, bool MustChangePassword);

public record RefreshRequest(string RefreshToken);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record UpdateProfileRequest(string? DisplayName, string? Timezone, string? AvatarUrl);

public record SetPushoverKeyRequest(string? UserKey);

public record SetupRequest(string Email, string Password, string DisplayName);

public record SetupStatusResponse(bool NeedsSetup);

public record UserProfileResponse(
    Guid Id,
    string Email,
    string DisplayName,
    string? AvatarUrl,
    string Timezone,
    string? PushoverUserKey,
    bool IsAdmin,
    bool MustChangePassword);
