using FluentValidation;
using Tasker.Api.Models.Dtos.Tags;

namespace Tasker.Api.Validators;

public class CreateTagRequestValidator : AbstractValidator<CreateTagRequest>
{
    public CreateTagRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Tag name is required")
            .MaximumLength(50);

        RuleFor(x => x.Color)
            .MaximumLength(9)
            .Matches(@"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$").WithMessage("Color must be a valid hex color")
            .When(x => x.Color is not null);
    }
}

public class UpdateTagRequestValidator : AbstractValidator<UpdateTagRequest>
{
    public UpdateTagRequestValidator()
    {
        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Tag name cannot be empty")
            .MaximumLength(50)
            .When(x => x.Name is not null);

        RuleFor(x => x.Color)
            .MaximumLength(9)
            .Matches(@"^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$").WithMessage("Color must be a valid hex color")
            .When(x => x.Color is not null);
    }
}
