namespace Tasker.Api.Models.Dtos.Admin;

public record CreateUserRequest(string Email, string DisplayName);

public record UpdateUserRequest(string? DisplayName, bool? IsAdmin);

public record AdminUserResponse(
    Guid Id,
    string Email,
    string DisplayName,
    bool IsAdmin,
    bool MustChangePassword,
    DateTime CreatedAt,
    bool HasPassword);

public record CreateUserResponse(
    Guid Id,
    string Email,
    string DisplayName,
    bool IsAdmin,
    bool MustChangePassword,
    DateTime CreatedAt,
    bool HasPassword,
    string InvitationToken);

public record GenerateLinkResponse(string Token);
