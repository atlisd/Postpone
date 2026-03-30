namespace Tasker.Api.Models.Entities;

public class RecurrenceException
{
    public Guid Id { get; set; }
    public Guid TaskId { get; set; }
    public DateOnly OriginalDate { get; set; }

    public bool IsSkipped { get; set; }
    public DateTime? CompletedAt { get; set; }

    // Field overrides (null = inherit from master)
    public string? Title { get; set; }
    public string? Description { get; set; }
    public short? Priority { get; set; }
    public DateOnly? OverriddenDueDate { get; set; }
    public DateTime? OverriddenDueDateTime { get; set; }
    public Guid? AssignedToId { get; set; }
    public bool ClearAssignedTo { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public TodoTask Task { get; set; } = null!;
    public User? AssignedTo { get; set; }
    public ICollection<ExceptionSubtaskCompletion> SubtaskCompletions { get; set; } = [];
}
