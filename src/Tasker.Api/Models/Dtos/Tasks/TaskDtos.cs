using System.Linq.Expressions;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Models.Dtos.Tasks;

public record CreateTaskRequest(
    string Title,
    string? Description,
    short? Priority,
    DateOnly? DueDate,
    DateTime? DueDateTime,
    Guid? AssignedToId);

public record UpdateTaskRequest(
    string? Title,
    string? Description,
    short? Priority,
    DateOnly? DueDate,
    bool ClearDueDate,
    DateTime? DueDateTime,
    bool ClearDueDateTime,
    Guid? AssignedToId);

public record UpdateDueDateRequest(DateOnly? DueDate);

public record MoveTaskRequest(Guid ProjectId);

public record TaskResponse(
    Guid Id,
    Guid ProjectId,
    string ProjectName,
    string ProjectColor,
    Guid CreatedById,
    string CreatedByName,
    Guid? AssignedToId,
    string? AssignedToName,
    string Title,
    string Description,
    short Priority,
    DateOnly? DueDate,
    DateTime? DueDateTime,
    DateTime? CompletedAt,
    string? Rrule,
    Guid? RecurrenceParentId,
    DateOnly? RecurrenceOriginDate,
    List<SubtaskResponse> Subtasks,
    List<TagResponse> Tags,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static readonly Expression<Func<TodoTask, TaskResponse>> Projection = t => new TaskResponse(
        t.Id,
        t.ProjectId,
        t.Project.Name,
        t.Project.Color,
        t.CreatedById,
        t.CreatedBy.DisplayName,
        t.AssignedToId,
        t.AssignedTo != null ? t.AssignedTo.DisplayName : null,
        t.Title,
        t.Description,
        t.Priority,
        t.DueDate,
        t.DueDateTime,
        t.CompletedAt,
        t.Rrule,
        t.RecurrenceParentId,
        t.RecurrenceOriginDate,
        t.Subtasks.OrderBy(s => s.SortOrder).Select(s => new SubtaskResponse(s.Id, s.Title, s.IsCompleted, s.SortOrder)).ToList(),
        t.TaskTags.Select(tt => new TagResponse(tt.Tag.Id, tt.Tag.Name, tt.Tag.Color)).ToList(),
        t.SortOrder,
        t.CreatedAt,
        t.UpdatedAt);
}

public record ReorderTasksRequest(List<Guid> OrderedIds);

public record SubtaskResponse(Guid Id, string Title, bool IsCompleted, double SortOrder);

public record CreateSubtaskRequest(string Title);

public record UpdateSubtaskRequest(string? Title, bool? IsCompleted);

public record ReorderSubtasksRequest(List<SubtaskOrderItem> Items);
public record SubtaskOrderItem(Guid Id, double SortOrder);

public record TagResponse(Guid Id, string Name, string Color);

public record SetRecurrenceRequest(string Rrule);
