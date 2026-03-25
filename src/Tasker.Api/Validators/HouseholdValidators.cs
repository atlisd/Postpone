using FluentValidation;
using Tasker.Api.Models.Dtos.Households;

namespace Tasker.Api.Validators;

public class CreateHouseholdRequestValidator : AbstractValidator<CreateHouseholdRequest>
{
    public CreateHouseholdRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Name is required")
            .MaximumLength(100);
    }
}

public class JoinHouseholdRequestValidator : AbstractValidator<JoinHouseholdRequest>
{
    public JoinHouseholdRequestValidator()
    {
        RuleFor(x => x.InviteCode)
            .NotEmpty().WithMessage("Invite code is required")
            .Length(8).WithMessage("Invite code must be 8 characters");
    }
}
