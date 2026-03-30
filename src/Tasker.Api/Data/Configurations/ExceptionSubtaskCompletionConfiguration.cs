using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data.Configurations;

public class ExceptionSubtaskCompletionConfiguration : IEntityTypeConfiguration<ExceptionSubtaskCompletion>
{
    public void Configure(EntityTypeBuilder<ExceptionSubtaskCompletion> builder)
    {
        builder.ToTable("exception_subtask_completions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");

        builder.HasIndex(e => new { e.RecurrenceExceptionId, e.SubtaskId }).IsUnique();

        builder.HasOne(e => e.RecurrenceException)
            .WithMany(re => re.SubtaskCompletions)
            .HasForeignKey(e => e.RecurrenceExceptionId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.Subtask)
            .WithMany()
            .HasForeignKey(e => e.SubtaskId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
