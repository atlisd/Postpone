namespace Tasker.Api.Models.Entities;

public class Household
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid CreatedById { get; set; }
    public string InviteCode { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User CreatedBy { get; set; } = null!;
    public ICollection<HouseholdMember> Members { get; set; } = [];
    public ICollection<Project> Projects { get; set; } = [];
}
