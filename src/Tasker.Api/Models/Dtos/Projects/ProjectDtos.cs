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
    int ShareCount = 0,
    Guid? FolderId = null,
    int SortOrder = 0);

// Folder DTOs
public record CreateFolderRequest(string Name, List<Guid> ProjectIds);

public record UpdateFolderRequest(string Name);

public record AddProjectToFolderRequest(Guid ProjectId);

public record ReorderFolderProjectsRequest(List<Guid> OrderedIds);

public record ReorderTopLevelRequest(List<TopLevelItem> Items);

public record TopLevelItem(string Type, Guid Id);

public record SetFolderCollapsedRequest(bool IsCollapsed);

public record ProjectFolderResponse(
    Guid Id,
    string Name,
    bool IsCollapsed,
    int SortOrder,
    List<ProjectResponse> Projects);
