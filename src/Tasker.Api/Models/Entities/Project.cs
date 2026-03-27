namespace Tasker.Api.Models.Entities;

public class Project
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public Guid? HouseholdId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#4A90D9";
    public string? Icon { get; set; }
    public bool IsArchived { get; set; }
    public bool IsInbox { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User Owner { get; set; } = null!;
    public Household? Household { get; set; }
    public ICollection<ProjectShare> Shares { get; set; } = [];
    public ICollection<TodoTask> Tasks { get; set; } = [];
}
