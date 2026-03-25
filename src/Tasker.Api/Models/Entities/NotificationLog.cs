namespace Tasker.Api.Models.Entities;

public class NotificationLog
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? TaskId { get; set; }
    public string Channel { get; set; } = string.Empty;
    public DateTime SentAt { get; set; }
    public string PayloadHash { get; set; } = string.Empty;

    public User User { get; set; } = null!;
    public TodoTask? Task { get; set; }
}
