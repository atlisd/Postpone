namespace Tasker.Api.Models.Dtos.Households;

public record CreateHouseholdRequest(string Name);

public record UpdateHouseholdRequest(string Name);

public record JoinHouseholdRequest(string InviteCode);

public record HouseholdResponse(
    Guid Id,
    string Name,
    Guid CreatedById,
    string CreatedByName,
    string InviteCode,
    List<HouseholdMemberResponse> Members,
    DateTime CreatedAt);

public record HouseholdMemberResponse(
    Guid UserId,
    string DisplayName,
    string Email,
    string Role,
    DateTime JoinedAt);

public record HouseholdSummaryResponse(
    Guid Id,
    string Name,
    int MemberCount,
    DateTime CreatedAt);
