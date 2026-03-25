namespace Tasker.Api.Models.Entities;

public class HouseholdMember
{
    public Guid HouseholdId { get; set; }
    public Guid UserId { get; set; }
    public string Role { get; set; } = "member";
    public DateTime JoinedAt { get; set; }

    public Household Household { get; set; } = null!;
    public User User { get; set; } = null!;
}
