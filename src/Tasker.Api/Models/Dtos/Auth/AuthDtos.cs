namespace Tasker.Api.Models.Dtos.Auth;

public record LoginRequest(string Email, string Password);

public record AuthResponse(string AccessToken, string RefreshToken, int ExpiresIn, bool MustChangePassword);

public record RefreshRequest(string RefreshToken);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record UpdateProfileRequest(string? DisplayName, string? Timezone, string? AvatarUrl, string? Locale, bool? UseGravatar);

public record SetPushoverKeyRequest(string? UserKey);

public record SetNotificationPreferencesRequest(bool? OverdueNotificationsEnabled, int? OverdueNotificationHour);

public record SetupRequest(string Email, string Password, string DisplayName);

public record SetupStatusResponse(bool NeedsSetup);

public record AcceptInvitationRequest(string Token, string NewPassword);

public record ResetPasswordRequest(string Token, string NewPassword);

public record ValidateTokenResponse(bool IsValid, string? Email, string? DisplayName);

public record UserProfileResponse(
    Guid Id,
    string Email,
    string DisplayName,
    string? AvatarUrl,
    string Timezone,
    string Locale,
    string? PushoverUserKey,
    bool OverdueNotificationsEnabled,
    int OverdueNotificationHour,
    bool UseGravatar,
    bool IsAdmin,
    bool MustChangePassword);
