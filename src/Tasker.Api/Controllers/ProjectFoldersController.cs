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
[Route("api/project-folders")]
[Authorize]
public class ProjectFoldersController(TaskerDbContext db, IProjectAccessService access, ISyncService sync) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.GetUserId();

        var folders = await db.ProjectFolders
            .Where(f => f.OwnerId == userId)
            .OrderBy(f => f.SortOrder)
            .ThenBy(f => f.CreatedAt)
            .ToListAsync();

        // For each folder, get projects the user can access that belong to it
        var accessibleProjectIds = await access.GetAccessibleProjectIdsAsync(userId);

        var folderIds = folders.Select(f => f.Id).ToList();
        var projects = await db.Projects
            .Where(p => p.FolderId.HasValue && folderIds.Contains(p.FolderId!.Value) && accessibleProjectIds.Contains(p.Id))
            .Include(p => p.Owner)
            .Select(p => new
            {
                p.Id,
                p.OwnerId,
                p.Owner.DisplayName,
                p.HouseholdId,
                p.Name,
                p.Color,
                p.Icon,
                p.IsArchived,
                p.CreatedAt,
                p.IsInbox,
                p.FolderId,
                p.SortOrder,
                TaskCount = p.Tasks.Count(t => !t.IsDeleted),
                CompletedTaskCount = p.Tasks.Count(t => !t.IsDeleted && t.CompletedAt != null),
                ShareCount = p.Shares.Count,
            })
            .ToListAsync();

        var result = folders.Select(f => new ProjectFolderResponse(
            f.Id,
            f.Name,
            f.IsCollapsed,
            f.SortOrder,
            projects
                .Where(p => p.FolderId == f.Id)
                .OrderBy(p => p.SortOrder)
                .ThenBy(p => p.CreatedAt)
                .Select(p => new ProjectResponse(
                    p.Id, p.OwnerId, p.DisplayName, p.HouseholdId,
                    p.Name, p.Color, p.Icon, p.IsArchived,
                    p.TaskCount, p.CompletedTaskCount, p.CreatedAt, p.IsInbox,
                    p.ShareCount, p.FolderId, p.SortOrder))
                .ToList()
        )).ToList();

        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateFolderRequest request)
    {
        var userId = User.GetUserId();

        // Verify user can access all projects being added
        foreach (var projectId in request.ProjectIds)
        {
            if (!await access.CanAccessProjectAsync(userId, projectId))
                return Forbid();
        }

        // Determine SortOrder: use the minimum SortOrder of the constituent projects
        var constituentProjects = await db.Projects
            .Where(p => request.ProjectIds.Contains(p.Id))
            .ToListAsync();

        var folderSortOrder = constituentProjects.Count > 0
            ? constituentProjects.Min(p => p.SortOrder)
            : int.MaxValue;

        var folder = new ProjectFolder
        {
            OwnerId = userId,
            Name = request.Name,
            SortOrder = folderSortOrder,
        };

        db.ProjectFolders.Add(folder);
        await db.SaveChangesAsync();

        // Assign projects to the folder
        for (int i = 0; i < constituentProjects.Count; i++)
        {
            constituentProjects[i].FolderId = folder.Id;
            constituentProjects[i].SortOrder = i;
        }

        await db.SaveChangesAsync();
        await sync.FolderCreated(userId);

        var projectResponses = constituentProjects
            .OrderBy(p => p.SortOrder)
            .Select(p => new ProjectResponse(
                p.Id, p.OwnerId, string.Empty, p.HouseholdId,
                p.Name, p.Color, p.Icon, p.IsArchived,
                0, 0, p.CreatedAt, p.IsInbox, 0, p.FolderId, p.SortOrder))
            .ToList();

        return Created($"/api/project-folders/{folder.Id}",
            new ProjectFolderResponse(folder.Id, folder.Name, folder.IsCollapsed, folder.SortOrder, projectResponses));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateFolderRequest request)
    {
        var userId = User.GetUserId();
        var folder = await db.ProjectFolders.FirstOrDefaultAsync(f => f.Id == id && f.OwnerId == userId);
        if (folder is null) return NotFound();

        folder.Name = request.Name;
        await db.SaveChangesAsync();
        await sync.FolderUpdated(userId);

        return NoContent();
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        var folder = await db.ProjectFolders
            .Include(f => f.Projects)
            .FirstOrDefaultAsync(f => f.Id == id && f.OwnerId == userId);
        if (folder is null) return NotFound();

        // Ungroup all projects
        foreach (var project in folder.Projects)
        {
            project.FolderId = null;
        }

        db.ProjectFolders.Remove(folder);
        await db.SaveChangesAsync();
        await sync.FolderDeleted(userId);

        return NoContent();
    }

    [HttpPost("{id:guid}/add")]
    public async Task<IActionResult> AddProject(Guid id, [FromBody] AddProjectToFolderRequest request)
    {
        var userId = User.GetUserId();
        var folder = await db.ProjectFolders.FirstOrDefaultAsync(f => f.Id == id && f.OwnerId == userId);
        if (folder is null) return NotFound();

        if (!await access.CanAccessProjectAsync(userId, request.ProjectId))
            return Forbid();

        var project = await db.Projects.FindAsync(request.ProjectId);
        if (project is null) return NotFound();

        // Place at end of folder
        var maxSortOrder = await db.Projects
            .Where(p => p.FolderId == id)
            .Select(p => (int?)p.SortOrder)
            .MaxAsync() ?? -1;

        project.FolderId = id;
        project.SortOrder = maxSortOrder + 1;

        await db.SaveChangesAsync();
        await sync.FolderUpdated(userId);

        return NoContent();
    }

    [HttpPost("{id:guid}/remove")]
    public async Task<IActionResult> RemoveProject(Guid id, [FromBody] AddProjectToFolderRequest request)
    {
        var userId = User.GetUserId();
        var folder = await db.ProjectFolders.FirstOrDefaultAsync(f => f.Id == id && f.OwnerId == userId);
        if (folder is null) return NotFound();

        var project = await db.Projects.FindAsync(request.ProjectId);
        if (project is null || project.FolderId != id) return NotFound();

        project.FolderId = null;
        // Place at end of top-level list
        var maxSortOrder = await db.Projects
            .Where(p => p.OwnerId == userId && p.FolderId == null && !p.IsInbox)
            .Select(p => (int?)p.SortOrder)
            .MaxAsync() ?? -1;
        project.SortOrder = maxSortOrder + 1;

        await db.SaveChangesAsync();
        await sync.FolderUpdated(userId);

        return NoContent();
    }

    [HttpPost("{id:guid}/reorder")]
    public async Task<IActionResult> ReorderProjects(Guid id, [FromBody] ReorderFolderProjectsRequest request)
    {
        var userId = User.GetUserId();
        var folder = await db.ProjectFolders.FirstOrDefaultAsync(f => f.Id == id && f.OwnerId == userId);
        if (folder is null) return NotFound();

        var projects = await db.Projects
            .Where(p => request.OrderedIds.Contains(p.Id) && p.FolderId == id)
            .ToListAsync();

        foreach (var project in projects)
        {
            project.SortOrder = request.OrderedIds.IndexOf(project.Id);
        }

        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("reorder-toplevel")]
    public async Task<IActionResult> ReorderTopLevel([FromBody] ReorderTopLevelRequest request)
    {
        var userId = User.GetUserId();

        for (int i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];
            if (item.Type == "folder")
            {
                var folder = await db.ProjectFolders.FirstOrDefaultAsync(f => f.Id == item.Id && f.OwnerId == userId);
                if (folder is not null) folder.SortOrder = i;
            }
            else if (item.Type == "project")
            {
                var project = await db.Projects.FirstOrDefaultAsync(p => p.Id == item.Id && p.OwnerId == userId && p.FolderId == null);
                if (project is not null) project.SortOrder = i;
            }
        }

        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPatch("{id:guid}/collapse")]
    public async Task<IActionResult> SetCollapsed(Guid id, [FromBody] SetFolderCollapsedRequest request)
    {
        var userId = User.GetUserId();
        var folder = await db.ProjectFolders.FirstOrDefaultAsync(f => f.Id == id && f.OwnerId == userId);
        if (folder is null) return NotFound();

        folder.IsCollapsed = request.IsCollapsed;
        await db.SaveChangesAsync();

        return NoContent();
    }
}
