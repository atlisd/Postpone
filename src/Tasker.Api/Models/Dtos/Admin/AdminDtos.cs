namespace Tasker.Api.Models.Dtos.Admin;

public record CreateUserRequest(string Email, string DisplayName, string Password);

public record UpdateUserRequest(string? DisplayName, string? Password, bool? IsAdmin);

public record AdminUserResponse(
    Guid Id,
    string Email,
    string DisplayName,
    bool IsAdmin,
    bool MustChangePassword,
    DateTime CreatedAt);
