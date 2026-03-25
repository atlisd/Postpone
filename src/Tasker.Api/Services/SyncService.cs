using Microsoft.AspNetCore.SignalR;
using Tasker.Api.Hubs;

namespace Tasker.Api.Services;

public class SyncService(IHubContext<SyncHub> hub) : ISyncService
{
    public async Task TaskCreated(Guid projectId, object task)
    {
        await hub.Clients.Group($"project:{projectId}").SendAsync("TaskCreated", task);
    }

    public async Task TaskUpdated(Guid projectId, object task)
    {
        await hub.Clients.Group($"project:{projectId}").SendAsync("TaskUpdated", task);
    }

    public async Task TaskDeleted(Guid projectId, Guid taskId)
    {
        await hub.Clients.Group($"project:{projectId}").SendAsync("TaskDeleted", new { taskId, projectId });
    }

    public async Task SubtaskUpdated(Guid projectId, Guid taskId)
    {
        await hub.Clients.Group($"project:{projectId}").SendAsync("SubtaskUpdated", new { taskId, projectId });
    }

    public async Task ProjectUpdated(Guid projectId)
    {
        await hub.Clients.Group($"project:{projectId}").SendAsync("ProjectUpdated", new { projectId });
    }

    public async Task NotifyUsers(IEnumerable<Guid> userIds, string eventName)
    {
        var groups = userIds.Select(id => $"user:{id}").ToList();
        if (groups.Count > 0)
        {
            await hub.Clients.Groups(groups).SendAsync(eventName);
        }
    }
}
