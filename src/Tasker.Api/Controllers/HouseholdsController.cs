using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Models.Dtos.Households;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Controllers;

[ApiController]
[Route("api/households")]
[Authorize]
public class HouseholdsController(TaskerDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var userId = User.GetUserId();

        var households = await db.HouseholdMembers
            .Where(hm => hm.UserId == userId)
            .Select(hm => new HouseholdSummaryResponse(
                hm.Household.Id,
                hm.Household.Name,
                hm.Household.Members.Count,
                hm.Household.CreatedAt))
            .ToListAsync();

        return Ok(households);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateHouseholdRequest request)
    {
        var userId = User.GetUserId();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Unauthorized();

        var household = new Household
        {
            Name = request.Name,
            CreatedById = userId,
            InviteCode = GenerateInviteCode(),
        };

        db.Households.Add(household);

        db.HouseholdMembers.Add(new HouseholdMember
        {
            Household = household,
            UserId = userId,
            Role = "owner",
            JoinedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync();

        return Created($"/api/households/{household.Id}", await GetHouseholdResponse(household.Id));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var userId = User.GetUserId();
        var isMember = await db.HouseholdMembers.AnyAsync(
            hm => hm.HouseholdId == id && hm.UserId == userId);
        if (!isMember) return NotFound();

        return Ok(await GetHouseholdResponse(id));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateHouseholdRequest request)
    {
        var userId = User.GetUserId();
        var membership = await db.HouseholdMembers
            .FirstOrDefaultAsync(hm => hm.HouseholdId == id && hm.UserId == userId);
        if (membership is null) return NotFound();
        if (membership.Role != "owner") return Forbid();

        var household = await db.Households.FindAsync(id);
        if (household is null) return NotFound();

        household.Name = request.Name;
        await db.SaveChangesAsync();

        return Ok(await GetHouseholdResponse(id));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = User.GetUserId();
        var household = await db.Households.FindAsync(id);
        if (household is null) return NotFound();
        if (household.CreatedById != userId) return Forbid();

        db.Households.Remove(household);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:guid}/regenerate-invite")]
    public async Task<IActionResult> RegenerateInvite(Guid id)
    {
        var userId = User.GetUserId();
        var membership = await db.HouseholdMembers
            .FirstOrDefaultAsync(hm => hm.HouseholdId == id && hm.UserId == userId);
        if (membership is null) return NotFound();
        if (membership.Role != "owner") return Forbid();

        var household = await db.Households.FindAsync(id);
        if (household is null) return NotFound();

        household.InviteCode = GenerateInviteCode();
        await db.SaveChangesAsync();

        return Ok(new { inviteCode = household.InviteCode });
    }

    [HttpPost("join")]
    public async Task<IActionResult> Join([FromBody] JoinHouseholdRequest request)
    {
        var userId = User.GetUserId();
        var code = request.InviteCode.Trim().ToUpperInvariant();

        var household = await db.Households
            .FirstOrDefaultAsync(h => h.InviteCode == code);
        if (household is null)
            return BadRequest(new { message = "Invalid invite code" });

        var alreadyMember = await db.HouseholdMembers.AnyAsync(
            hm => hm.HouseholdId == household.Id && hm.UserId == userId);
        if (alreadyMember)
            return Conflict(new { message = "Already a member of this household" });

        db.HouseholdMembers.Add(new HouseholdMember
        {
            HouseholdId = household.Id,
            UserId = userId,
            Role = "member",
            JoinedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync();

        return Ok(await GetHouseholdResponse(household.Id));
    }

    [HttpDelete("{id:guid}/members/{userId:guid}")]
    public async Task<IActionResult> RemoveMember(Guid id, Guid userId)
    {
        var currentUserId = User.GetUserId();

        var currentMembership = await db.HouseholdMembers
            .FirstOrDefaultAsync(hm => hm.HouseholdId == id && hm.UserId == currentUserId);
        if (currentMembership is null) return NotFound();

        // Can remove yourself or (as owner) remove others
        if (userId != currentUserId && currentMembership.Role != "owner")
            return Forbid();

        var targetMembership = await db.HouseholdMembers
            .FirstOrDefaultAsync(hm => hm.HouseholdId == id && hm.UserId == userId);
        if (targetMembership is null) return NotFound();

        // Owner can't be removed (must delete household)
        if (targetMembership.Role == "owner" && userId != currentUserId)
            return BadRequest(new { message = "Cannot remove the household owner" });

        db.HouseholdMembers.Remove(targetMembership);
        await db.SaveChangesAsync();

        return NoContent();
    }

    [HttpGet("{id:guid}/members")]
    public async Task<IActionResult> GetMembers(Guid id)
    {
        var userId = User.GetUserId();
        var isMember = await db.HouseholdMembers.AnyAsync(
            hm => hm.HouseholdId == id && hm.UserId == userId);
        if (!isMember) return NotFound();

        var members = await db.HouseholdMembers
            .Where(hm => hm.HouseholdId == id)
            .Select(hm => new HouseholdMemberResponse(
                hm.UserId,
                hm.User.DisplayName,
                hm.User.Email,
                hm.Role,
                hm.JoinedAt))
            .ToListAsync();

        return Ok(members);
    }

    private async Task<HouseholdResponse> GetHouseholdResponse(Guid id)
    {
        return await db.Households
            .Where(h => h.Id == id)
            .Select(h => new HouseholdResponse(
                h.Id,
                h.Name,
                h.CreatedById,
                h.CreatedBy.DisplayName,
                h.InviteCode,
                h.Members.Select(m => new HouseholdMemberResponse(
                    m.UserId,
                    m.User.DisplayName,
                    m.User.Email,
                    m.Role,
                    m.JoinedAt)).ToList(),
                h.CreatedAt))
            .FirstAsync();
    }

    private static string GenerateInviteCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        Span<byte> bytes = stackalloc byte[8];
        RandomNumberGenerator.Fill(bytes);
        return string.Create(8, bytes.ToArray(), (span, b) =>
        {
            for (int i = 0; i < span.Length; i++)
                span[i] = chars[b[i] % chars.Length];
        });
    }
}
