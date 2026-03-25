namespace Tasker.Api.Models.Entities;

public class ProjectShare
{
    public Guid ProjectId { get; set; }
    public Guid UserId { get; set; }
    public string Permission { get; set; } = "edit";
    public DateTime CreatedAt { get; set; }

    public Project Project { get; set; } = null!;
    public User User { get; set; } = null!;
}
