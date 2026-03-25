namespace Tasker.Api.Services;

public interface IRecurrenceService
{
    /// <summary>
    /// Generate recurring task instances for all templates up to the horizon.
    /// Called by background job and lazily on query.
    /// </summary>
    Task GenerateInstancesAsync(int horizonDays = 14);

    /// <summary>
    /// Generate instances for a specific template task.
    /// </summary>
    Task GenerateInstancesForTemplateAsync(Guid templateTaskId, int horizonDays = 14);

    /// <summary>
    /// Set or update recurrence on a task. Converts it to a template.
    /// </summary>
    Task SetRecurrenceAsync(Guid taskId, string rrule);

    /// <summary>
    /// Remove recurrence from a task.
    /// </summary>
    Task RemoveRecurrenceAsync(Guid taskId);
}
