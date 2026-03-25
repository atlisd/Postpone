using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public interface IProjectAccessService
{
    /// <summary>
    /// Returns all project IDs the user can access (owned + shared + household).
    /// </summary>
    Task<List<Guid>> GetAccessibleProjectIdsAsync(Guid userId);

    /// <summary>
    /// Checks if the user can access a specific project.
    /// </summary>
    Task<bool> CanAccessProjectAsync(Guid userId, Guid projectId);

    /// <summary>
    /// Checks if the user can edit a specific project (owner, edit share, or household member).
    /// </summary>
    Task<bool> CanEditProjectAsync(Guid userId, Guid projectId);

    /// <summary>
    /// Returns an IQueryable of tasks the user can see (across all accessible projects, not deleted).
    /// </summary>
    IQueryable<TodoTask> GetAccessibleTasks(Guid userId);
}
