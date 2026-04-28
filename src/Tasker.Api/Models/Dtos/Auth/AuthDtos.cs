namespace Tasker.Api.Models.Dtos.Auth;

public record LoginRequest(string Email, string Password);

public record AuthResponse(string AccessToken, string RefreshToken, int ExpiresIn, bool MustChangePassword);

public record RefreshRequest(string RefreshToken);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record UpdateProfileRequest(string? DisplayName, string? Timezone, string? AvatarUrl, string? Locale, bool? UseGravatar, bool? ShowAllTasksList, bool? ShowPriorityTasksList, Guid[]? PinnedProjectIds, Guid[]? PinnedTagIds, bool? HideCompletedInCalendar, string? AppName);

public record SetPushoverKeyRequest(string? UserKey);

public record SetNotificationPreferencesRequest(
    bool? OverdueNotificationsEnabled,
    int? OverdueNotificationHour,
    int? OverdueNotificationMinute,
    bool? TodayNotificationsEnabled,
    int? TodayNotificationHour,
    int? TodayNotificationMinute,
    int? TodayNotificationWeekendHour,
    int? TodayNotificationWeekendMinute,
    bool? TodayNotificationsGrouped);

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
    int OverdueNotificationMinute,
    bool TodayNotificationsEnabled,
    int TodayNotificationHour,
    int TodayNotificationMinute,
    int TodayNotificationWeekendHour,
    int TodayNotificationWeekendMinute,
    bool TodayNotificationsGrouped,
    bool UseGravatar,
    bool IsAdmin,
    bool MustChangePassword,
    bool ShowAllTasksList,
    bool ShowPriorityTasksList,
    Guid[] PinnedProjectIds,
    Guid[] PinnedTagIds,
    bool HideCompletedInCalendar,
    string? AppName);
