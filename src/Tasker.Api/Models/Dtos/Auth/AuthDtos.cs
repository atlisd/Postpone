namespace Tasker.Api.Models.Dtos.Auth;

/// <param name="DeviceName">Optional label stored with the session (e.g. "Atli's iPad").</param>
/// <param name="ReturnRefreshToken">
/// Native clients set this to true to receive the refresh token in the response body instead of
/// an HttpOnly cookie. They must then send it back in the body of /refresh and /logout.
/// </param>
public record LoginRequest(string Email, string Password, string? DeviceName = null, bool ReturnRefreshToken = false);

/// <summary>Token response for native clients (refresh token delivered in the body).</summary>
public record NativeTokenResponse(string AccessToken, string RefreshToken, int ExpiresIn, bool MustChangePassword);

public record AuthResponse(string AccessToken, string RefreshToken, int ExpiresIn, bool MustChangePassword);

public record RefreshRequest(string? RefreshToken);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public record UpdateProfileRequest(string? DisplayName, string? Timezone, string? AvatarUrl, string? Locale, bool? UseGravatar, bool? ShowAllTasksList, bool? ShowPriorityTasksList, Guid[]? PinnedProjectIds, Guid[]? PinnedTagIds, bool? HideCompletedInCalendar, string? AppName, int? CountdownPrecision = null);

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
    string? AppName,
    int CountdownPrecision);
