namespace Tasker.Api.Models.Dtos.Tags;

public record CreateTagRequest(string Name, string? Color);

public record UpdateTagRequest(string? Name, string? Color);

public record TagFullResponse(Guid Id, string Name, string Color, DateTime CreatedAt);

public record AddTagToTaskRequest(Guid TagId);
