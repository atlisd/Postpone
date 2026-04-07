using Tasker.Api.Models.Dtos.Tasks;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public interface IRecurrenceService
{
    /// <summary>
    /// Expand virtual occurrences for recurring series tasks within a date range.
    /// Merges with RecurrenceExceptions for per-occurrence modifications.
    /// </summary>
    Task<List<TaskResponse>> ExpandOccurrencesAsync(
        IQueryable<TodoTask> seriesTasks, DateOnly rangeStart, DateOnly rangeEnd);

    /// <summary>
    /// Set or update recurrence on a task.
    /// </summary>
    Task SetRecurrenceAsync(Guid taskId, string rrule);

    /// <summary>
    /// Remove recurrence from a task (converts back to normal task).
    /// </summary>
    Task RemoveRecurrenceAsync(Guid taskId);

    /// <summary>
    /// Complete a single occurrence of a recurring task.
    /// </summary>
    Task<RecurrenceException> CompleteOccurrenceAsync(Guid seriesId, DateOnly occurrenceDate);

    /// <summary>
    /// Uncomplete a single occurrence of a recurring task.
    /// </summary>
    Task UncompleteOccurrenceAsync(Guid seriesId, DateOnly occurrenceDate);

    /// <summary>
    /// Skip (delete) a single occurrence of a recurring task.
    /// </summary>
    Task SkipOccurrenceAsync(Guid seriesId, DateOnly occurrenceDate);

    /// <summary>
    /// Edit field overrides for a single occurrence.
    /// </summary>
    Task<RecurrenceException> EditOccurrenceAsync(
        Guid seriesId, DateOnly occurrenceDate, EditOccurrenceRequest request);

    /// <summary>
    /// Reschedule a single occurrence to a different date.
    /// </summary>
    Task<RecurrenceException> RescheduleOccurrenceAsync(
        Guid seriesId, DateOnly occurrenceDate, DateOnly newDate);

    /// <summary>
    /// Toggle subtask completion for a specific occurrence.
    /// </summary>
    Task ToggleOccurrenceSubtaskAsync(
        Guid seriesId, DateOnly occurrenceDate, Guid subtaskId, bool isCompleted);

    /// <summary>
    /// Split the recurring series at the given occurrence: the original series ends just before
    /// <paramref name="fromDate"/> (UNTIL added to RRULE), and a new series is created starting
    /// at <paramref name="newDate"/> with the same recurrence pattern.
    /// </summary>
    /// <returns>The updated original task and the newly created task.</returns>
    Task<(TodoTask original, TodoTask newTask)> SplitSeriesFromAsync(
        Guid taskId, DateOnly fromDate, DateOnly newDate);
}
