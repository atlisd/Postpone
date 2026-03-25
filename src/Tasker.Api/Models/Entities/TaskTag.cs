namespace Tasker.Api.Models.Entities;

public class TaskTag
{
    public Guid TaskId { get; set; }
    public Guid TagId { get; set; }

    public TodoTask Task { get; set; } = null!;
    public Tag Tag { get; set; } = null!;
}
