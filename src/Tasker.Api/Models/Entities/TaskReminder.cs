namespace Tasker.Api.Models.Entities;

public class TaskReminder
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public int OffsetMinutes { get; set; }
    public DateTime CreatedAt { get; set; }

    public TodoTask Task { get; set; } = null!;
}
