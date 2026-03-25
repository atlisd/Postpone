using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Services;

namespace Tasker.Api.Hubs;

[Authorize]
public class SyncHub(IServiceScopeFactory scopeFactory) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var userId = GetUserId();
        if (userId == Guid.Empty)
        {
            Context.Abort();
            return;
        }

        // Join groups for all accessible projects
        using var scope = scopeFactory.CreateScope();
        var access = scope.ServiceProvider.GetRequiredService<IProjectAccessService>();
        var projectIds = await access.GetAccessibleProjectIdsAsync(userId);

        foreach (var projectId in projectIds)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"project:{projectId}");
        }

        // Also join a personal group for user-specific events
        await Groups.AddToGroupAsync(Context.ConnectionId, $"user:{userId}");

        await base.OnConnectedAsync();
    }

    public async Task JoinProject(string projectId)
    {
        var userId = GetUserId();
        using var scope = scopeFactory.CreateScope();
        var access = scope.ServiceProvider.GetRequiredService<IProjectAccessService>();

        if (await access.CanAccessProjectAsync(userId, Guid.Parse(projectId)))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"project:{projectId}");
        }
    }

    public async Task LeaveProject(string projectId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"project:{projectId}");
    }

    private Guid GetUserId()
    {
        var claim = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return claim is not null ? Guid.Parse(claim) : Guid.Empty;
    }
}
