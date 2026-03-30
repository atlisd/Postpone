using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data.Configurations;

public class RecurrenceExceptionConfiguration : IEntityTypeConfiguration<RecurrenceException>
{
    public void Configure(EntityTypeBuilder<RecurrenceException> builder)
    {
        builder.ToTable("recurrence_exceptions");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(e => e.IsSkipped).HasDefaultValue(false);
        builder.Property(e => e.ClearAssignedTo).HasDefaultValue(false);
        builder.Property(e => e.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(e => e.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasIndex(e => new { e.TaskId, e.OriginalDate }).IsUnique();

        builder.HasOne(e => e.Task)
            .WithMany(t => t.RecurrenceExceptions)
            .HasForeignKey(e => e.TaskId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.AssignedTo)
            .WithMany()
            .HasForeignKey(e => e.AssignedToId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
