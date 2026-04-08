namespace Tasker.Api.Models.Dtos.Projects;

public record CreateProjectRequest(string Name, string? Color, string? Icon, Guid? HouseholdId);

public record UpdateProjectRequest(string? Name, string? Color, string? Icon, bool? IsArchived);

public record ShareProjectRequest(Guid UserId, string Permission = "edit");

public record ReorderProjectsRequest(List<Guid> OrderedIds);

public record ProjectResponse(
    Guid Id,
    Guid OwnerId,
    string OwnerName,
    Guid? HouseholdId,
    string Name,
    string Color,
    string? Icon,
    bool IsArchived,
    int TaskCount,
    int CompletedTaskCount,
    DateTime CreatedAt,
    bool IsInbox,
    int ShareCount = 0);
