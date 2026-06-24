using FluentValidation;
using Ical.Net;
using Ical.Net.DataTypes;
using Tasker.Api.Models.Dtos.Tasks;

namespace Tasker.Api.Validators;

public class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Title is required")
            .MaximumLength(500).WithMessage("Title must not exceed 500 characters");

        RuleFor(x => x.Description)
            .MaximumLength(5000)
            .When(x => x.Description is not null);

        RuleFor(x => x.Priority)
            .Must(p => p is null or >= 0 and <= 3).WithMessage("Priority must be 0-3");

        RuleFor(x => x)
            .Must(x => x.EndDate == null || x.DueDate == null || x.EndDate >= x.DueDate)
            .WithMessage("End date cannot be before the due date");
    }
}

public class UpdateTaskRequestValidator : AbstractValidator<UpdateTaskRequest>
{
    public UpdateTaskRequestValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty().WithMessage("Title must not be empty")
            .MaximumLength(500)
            .When(x => x.Title is not null);

        RuleFor(x => x.Description)
            .MaximumLength(5000)
            .When(x => x.Description is not null);

        RuleFor(x => x.Priority)
            .Must(p => p is null or >= 0 and <= 3).WithMessage("Priority must be 0-3");

        RuleFor(x => x)
            .Must(x => x.EndDate == null || x.DueDate == null || x.EndDate >= x.DueDate)
            .WithMessage("End date cannot be before the due date");
    }
}

public class CreateSubtaskRequestValidator : AbstractValidator<CreateSubtaskRequest>
{
    public CreateSubtaskRequestValidator()
    {
        RuleFor(x => x.Title)
            .NotEmpty()
            .MaximumLength(500);
    }
}

public class SetRecurrenceRequestValidator : AbstractValidator<SetRecurrenceRequest>
{
    public SetRecurrenceRequestValidator()
    {
        RuleFor(x => x.Rrule)
            .NotEmpty()
            .Must(rrule =>
            {
                try
                {
                    var recur = new RecurrencePattern(rrule);
                    return recur.Frequency >= FrequencyType.Daily;
                }
                catch { return false; }
            })
            .WithMessage("RRULE must be a valid recurrence rule with a frequency of DAILY or longer (WEEKLY, MONTHLY, YEARLY).");
    }
}
