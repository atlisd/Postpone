namespace Tasker.Api.Models.Entities;

public class ProjectFolder
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string Name { get; set; } = "New Folder";
    public int SortOrder { get; set; }
    public bool IsCollapsed { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User Owner { get; set; } = null!;
    public ICollection<Project> Projects { get; set; } = [];
}
