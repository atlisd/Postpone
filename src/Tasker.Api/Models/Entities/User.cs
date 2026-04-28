namespace Tasker.Api.Models.Entities;

public class User
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string EmailNormalized { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string? AvatarUrl { get; set; }
    public string Timezone { get; set; } = "UTC";
    public string Locale { get; set; } = "en";
    public string? PushoverUserKey { get; set; }
    public bool OverdueNotificationsEnabled { get; set; } = true;
    public int OverdueNotificationHour { get; set; } = 8;
    public int OverdueNotificationMinute { get; set; } = 0;
    public bool TodayNotificationsEnabled { get; set; } = true;
    public int TodayNotificationHour { get; set; } = 8;
    public int TodayNotificationMinute { get; set; } = 0;
    public int TodayNotificationWeekendHour { get; set; } = 8;
    public int TodayNotificationWeekendMinute { get; set; } = 0;
    public bool TodayNotificationsGrouped { get; set; } = false;
    public bool UseGravatar { get; set; } = false;
    public bool ShowAllTasksList { get; set; } = true;
    public bool ShowPriorityTasksList { get; set; } = false;
    public bool HideCompletedInCalendar { get; set; } = false;
    public string? AppName { get; set; }
    public Guid[] PinnedProjectIds { get; set; } = [];
    public Guid[] PinnedTagIds { get; set; } = [];
    public bool IsAdmin { get; set; }
    public bool MustChangePassword { get; set; } = true;
    public string? InvitationTokenHash { get; set; }
    public DateTime? InvitationExpiresAt { get; set; }
    public string? PasswordResetTokenHash { get; set; }
    public DateTime? PasswordResetExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
    public ICollection<HouseholdMember> HouseholdMemberships { get; set; } = [];
    public ICollection<Project> OwnedProjects { get; set; } = [];
    public ICollection<ProjectShare> ProjectShares { get; set; } = [];
    public ICollection<Tag> Tags { get; set; } = [];
}
