using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public interface ITokenService
{
    string GenerateAccessToken(User user);
    (string token, string hash) GenerateRefreshToken();
    string HashToken(string token);
}
