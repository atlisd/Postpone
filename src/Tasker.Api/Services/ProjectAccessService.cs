using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Services;

public class ProjectAccessService(TaskerDbContext db) : IProjectAccessService
{
    public async Task<List<Guid>> GetAccessibleProjectIdsAsync(Guid userId)
    {
        // 1. Projects the user owns
        var owned = db.Projects
            .Where(p => p.OwnerId == userId && !p.IsArchived)
            .Select(p => p.Id);

        // 2. Projects shared directly with the user
        var shared = db.ProjectShares
            .Where(ps => ps.UserId == userId)
            .Select(ps => ps.ProjectId);

        // 3. Household projects where the user is a member
        var householdIds = db.HouseholdMembers
            .Where(hm => hm.UserId == userId)
            .Select(hm => hm.HouseholdId);

        var household = db.Projects
            .Where(p => p.HouseholdId != null && householdIds.Contains(p.HouseholdId.Value) && !p.IsArchived)
            .Select(p => p.Id);

        return await owned.Union(shared).Union(household).Distinct().ToListAsync();
    }

    public async Task<bool> CanAccessProjectAsync(Guid userId, Guid projectId)
    {
        var project = await db.Projects.FindAsync(projectId);
        if (project is null) return false;
        if (project.OwnerId == userId) return true;

        // Check direct share
        if (await db.ProjectShares.AnyAsync(ps => ps.ProjectId == projectId && ps.UserId == userId))
            return true;

        // Check household membership
        if (project.HouseholdId.HasValue)
        {
            return await db.HouseholdMembers.AnyAsync(
                hm => hm.HouseholdId == project.HouseholdId.Value && hm.UserId == userId);
        }

        return false;
    }

    public async Task<bool> CanEditProjectAsync(Guid userId, Guid projectId)
    {
        var project = await db.Projects.FindAsync(projectId);
        if (project is null) return false;
        if (project.OwnerId == userId) return true;

        // Check direct share with edit permission
        var share = await db.ProjectShares.FirstOrDefaultAsync(
            ps => ps.ProjectId == projectId && ps.UserId == userId);
        if (share is not null) return share.Permission == "edit";

        // Check household membership (all members can edit household projects)
        if (project.HouseholdId.HasValue)
        {
            return await db.HouseholdMembers.AnyAsync(
                hm => hm.HouseholdId == project.HouseholdId.Value && hm.UserId == userId);
        }

        return false;
    }

    public IQueryable<TodoTask> GetAccessibleTasks(Guid userId)
    {
        // Get household IDs for the user
        var householdIds = db.HouseholdMembers
            .Where(hm => hm.UserId == userId)
            .Select(hm => hm.HouseholdId);

        return db.Tasks
            .Where(t => !t.IsDeleted && t.RecurrenceParentId == null) // exclude templates shown as non-completable
            .Where(t =>
                t.Project.OwnerId == userId ||
                db.ProjectShares.Any(ps => ps.ProjectId == t.ProjectId && ps.UserId == userId) ||
                (t.Project.HouseholdId != null && householdIds.Contains(t.Project.HouseholdId.Value)));
    }
}
