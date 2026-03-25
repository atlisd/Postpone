namespace Tasker.Api.Models.Entities;

public class Subtask
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsCompleted { get; set; }
    public double SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }

    public TodoTask Task { get; set; } = null!;
}
