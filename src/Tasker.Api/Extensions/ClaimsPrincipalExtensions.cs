using System.Security.Claims;

namespace Tasker.Api.Extensions;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        var sub = principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new UnauthorizedAccessException("Missing user ID claim");
        return Guid.Parse(sub);
    }

    public static bool IsAdmin(this ClaimsPrincipal principal)
    {
        return principal.FindFirstValue("is_admin") == "true";
    }
}
