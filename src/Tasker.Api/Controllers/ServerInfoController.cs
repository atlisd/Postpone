using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Tasker.Api.Controllers;

/// <summary>
/// Unauthenticated probe used by native clients to validate a user-entered server URL
/// and check API compatibility before showing the login screen.
/// </summary>
[ApiController]
[Route("api/server-info")]
[AllowAnonymous]
public class ServerInfoController : ControllerBase
{
    /// <summary>Bump when a breaking change is made to the API contract native clients rely on.</summary>
    public const int ApiVersion = 1;

    private static readonly string ServerVersion =
        typeof(ServerInfoController).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            .Split('+')[0]
        ?? "unknown";

    [HttpGet]
    public IActionResult Get() => Ok(new { product = "Postpone", apiVersion = ApiVersion, serverVersion = ServerVersion });
}
