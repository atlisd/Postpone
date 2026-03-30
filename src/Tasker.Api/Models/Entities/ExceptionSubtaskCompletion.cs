namespace Tasker.Api.Models.Entities;

public class ExceptionSubtaskCompletion
{
    public Guid Id { get; set; }
    public Guid RecurrenceExceptionId { get; set; }
    public Guid SubtaskId { get; set; }
    public bool IsCompleted { get; set; }

    public RecurrenceException RecurrenceException { get; set; } = null!;
    public Subtask Subtask { get; set; } = null!;
}
