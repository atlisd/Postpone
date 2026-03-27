namespace Tasker.Api.Models.Entities;

public class TodoTask
{
    public Guid Id { get; set; }
    public Guid ProjectId { get; set; }
    public Guid CreatedById { get; set; }
    public Guid? AssignedToId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public short Priority { get; set; } // 0=none, 1=low, 2=medium, 3=high
    public DateOnly? DueDate { get; set; }
    public DateTime? DueDateTime { get; set; }
    public DateTime? CompletedAt { get; set; }
    public bool IsDeleted { get; set; }

    // Recurrence
    public string? Rrule { get; set; }
    public Guid? RecurrenceParentId { get; set; }
    public DateOnly? RecurrenceOriginDate { get; set; }

    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Project Project { get; set; } = null!;
    public User CreatedBy { get; set; } = null!;
    public User? AssignedTo { get; set; }
    public TodoTask? RecurrenceParent { get; set; }
    public ICollection<TodoTask> RecurrenceChildren { get; set; } = [];
    public ICollection<Subtask> Subtasks { get; set; } = [];
    public ICollection<TaskTag> TaskTags { get; set; } = [];
}
