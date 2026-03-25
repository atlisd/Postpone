namespace Tasker.Api.Models.Entities;

public class Tag
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#888888";
    public DateTime CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public ICollection<TaskTag> TaskTags { get; set; } = [];
}
