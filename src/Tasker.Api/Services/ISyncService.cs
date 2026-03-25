namespace Tasker.Api.Services;

public interface ISyncService
{
    Task TaskCreated(Guid projectId, object task);
    Task TaskUpdated(Guid projectId, object task);
    Task TaskDeleted(Guid projectId, Guid taskId);
    Task SubtaskUpdated(Guid projectId, Guid taskId);
    Task ProjectUpdated(Guid projectId);
}
