using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Projects;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/projects")]
[Authorize]
public class ProjectsController(TaskerDbContext db, IProjectAccessService access, ISyncService sync) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.GetUserId();
        var projectIds = await access.GetAccessibleProjectIdsAsync(userId);

        var projects = await db.Projects
            .Where(p => projectIds.Contains(p.Id))
            .Include(p => p.Owner)
            .OrderByDescending(p => p.IsInbox)
            .ThenBy(p => p.CreatedAt)
            .Select(p => new ProjectResponse(
                p.Id,
                p.OwnerId,
                p.Owner.DisplayName,
                p.HouseholdId,
                p.Name,
                p.Color,
                p.Icon,
                p.IsArchived,
                p.Tasks.Count(t => !t.IsDeleted && t.RecurrenceParentId == null),
                p.Tasks.Count(t => !t.IsDeleted && t.CompletedAt != null && t.RecurrenceParentId == null),
                p.CreatedAt,
                p.IsInbox))
            .ToListAsync();

        return Ok(projects);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateProjectRequest request)
    {
        var userId = User.GetUserId();

        // If household project, verify membership
        if (request.HouseholdId.HasValue)
        {
            var isMember = await db.HouseholdMembers.AnyAsync(
                hm => hm.HouseholdId == request.HouseholdId.Value && hm.UserId == userId);
            if (!isMember)
                return Forbid();
        }

        var project = new Project
        {
            OwnerId = userId,
            HouseholdId = request.HouseholdId,
            Name = request.Name,
            Color = request.Color ?? "#4A90D9",
            Icon = request.Icon,
        };

        db.Projects.Add(project);
        await db.SaveChangesAsync();

        // Notify household members about the new project
        if (project.HouseholdId.HasValue)
        {
            var memberIds = await db.HouseholdMembers
                .Where(hm => hm.HouseholdId == project.HouseholdId.Value)
                .Select(hm => hm.UserId)
                .ToListAsync();
            await sync.NotifyUsers(memberIds, "ProjectCreated");
        }

        var owner = await db.Users.FindAsync(userId);
        return Created($"/api/projects/{project.Id}", new ProjectResponse(
            project.Id, project.OwnerId, owner!.DisplayName, project.HouseholdId,
            project.Name, project.Color, project.Icon, project.IsArchived, 0, 0, project.CreatedAt, project.IsInbox));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = User.GetUserId();
        if (!await access.CanAccessProjectAsync(userId, id))
            return NotFound();

        var project = await db.Projects
            .Include(p => p.Owner)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (project is null) return NotFound();

        var taskCount = await db.Tasks.CountAsync(t => t.ProjectId == id && !t.IsDeleted && t.RecurrenceParentId == null);
        var completedCount = await db.Tasks.CountAsync(t => t.ProjectId == id && !t.IsDeleted && t.CompletedAt != null && t.RecurrenceParentId == null);

        return Ok(new ProjectResponse(
            project.Id, project.OwnerId, project.Owner.DisplayName, project.HouseholdId,
            project.Name, project.Color, project.Icon, project.IsArchived,
            taskCount, completedCount, project.CreatedAt, project.IsInbox));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateProjectRequest request)
    {
        var userId = User.GetUserId();
        var project = await db.Projects.Include(p => p.Owner).FirstOrDefaultAsync(p => p.Id == id);
        if (project is null) return NotFound();
        if (project.OwnerId != userId) return Forbid();
        if (project.IsInbox && request.IsArchived == true)
            return BadRequest(new { message = "The Inbox project cannot be archived." });

        if (request.Name is not null) project.Name = request.Name;
        if (request.Color is not null) project.Color = request.Color;
        if (request.Icon is not null) project.Icon = request.Icon;
        if (request.IsArchived.HasValue) project.IsArchived = request.IsArchived.Value;

        await db.SaveChangesAsync();

        await sync.ProjectUpdated(id);

        var taskCount = await db.Tasks.CountAsync(t => t.ProjectId == id && !t.IsDeleted && t.RecurrenceParentId == null);
        var completedCount = await db.Tasks.CountAsync(t => t.ProjectId == id && !t.IsDeleted && t.CompletedAt != null && t.RecurrenceParentId == null);

        return Ok(new ProjectResponse(
            project.Id, project.OwnerId, project.Owner.DisplayName, project.HouseholdId,
            project.Name, project.Color, project.Icon, project.IsArchived,
            taskCount, completedCount, project.CreatedAt, project.IsInbox));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        var project = await db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        if (project.OwnerId != userId) return Forbid();
        if (project.IsInbox)
            return BadRequest(new { message = "The Inbox project cannot be deleted." });

        var householdId = project.HouseholdId;
        db.Projects.Remove(project);
        await db.SaveChangesAsync();

        // Notify household members about the deleted project
        if (householdId.HasValue)
        {
            var memberIds = await db.HouseholdMembers
                .Where(hm => hm.HouseholdId == householdId.Value)
                .Select(hm => hm.UserId)
                .ToListAsync();
            await sync.NotifyUsers(memberIds, "ProjectDeleted");
        }

        return NoContent();
    }

    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var userId = User.GetUserId();
        if (!await access.CanAccessProjectAsync(userId, id))
            return NotFound();

        var project = await db.Projects.FindAsync(id);
        if (project is null) return NotFound();

        var members = new List<object>();

        if (project.HouseholdId.HasValue)
        {
            // Household project: return all household members
            var householdMembers = await db.HouseholdMembers
                .Where(hm => hm.HouseholdId == project.HouseholdId.Value)
                .Select(hm => new { hm.UserId, hm.User.DisplayName, hm.User.Email })
                .ToListAsync();
            members.AddRange(householdMembers);
        }
        else
        {
            // Private project: owner + direct shares
            var owner = await db.Users
                .Where(u => u.Id == project.OwnerId)
                .Select(u => new { UserId = u.Id, u.DisplayName, u.Email })
                .FirstAsync();
            members.Add(owner);

            var shares = await db.ProjectShares
                .Where(ps => ps.ProjectId == id)
                .Select(ps => new { ps.UserId, ps.User.DisplayName, ps.User.Email })
                .ToListAsync();
            members.AddRange(shares);
        }

        return Ok(members);
    }

    [HttpPost("{id:guid}/share")]
    public async Task<IActionResult> Share(Guid id, [FromBody] ShareProjectRequest request)
    {
        var userId = User.GetUserId();
        var project = await db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        if (project.OwnerId != userId) return Forbid();

        var exists = await db.ProjectShares.AnyAsync(ps => ps.ProjectId == id && ps.UserId == request.UserId);
        if (exists) return Conflict(new { message = "Already shared with this user" });

        db.ProjectShares.Add(new ProjectShare
        {
            ProjectId = id,
            UserId = request.UserId,
            Permission = request.Permission
        });
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:guid}/share/{userId:guid}")]
    public async Task<IActionResult> Unshare(Guid id, Guid userId)
    {
        var currentUserId = User.GetUserId();
        var project = await db.Projects.FindAsync(id);
        if (project is null) return NotFound();
        if (project.OwnerId != currentUserId) return Forbid();

        var share = await db.ProjectShares.FirstOrDefaultAsync(ps => ps.ProjectId == id && ps.UserId == userId);
        if (share is null) return NotFound();

        db.ProjectShares.Remove(share);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
