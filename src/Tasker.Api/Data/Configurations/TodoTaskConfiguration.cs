using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data.Configurations;

public class TodoTaskConfiguration : IEntityTypeConfiguration<TodoTask>
{
    public void Configure(EntityTypeBuilder<TodoTask> builder)
    {
        builder.ToTable("tasks");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(t => t.Title).IsRequired();
        builder.Property(t => t.Description).IsRequired().HasDefaultValue("");
        builder.Property(t => t.Priority).HasDefaultValue((short)0);
        builder.Property(t => t.IsDeleted).HasDefaultValue(false);
        builder.Property(t => t.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(t => t.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasIndex(t => t.ProjectId).HasFilter("NOT \"IsDeleted\"");
        builder.HasIndex(t => t.DueDate).HasFilter("\"DueDate\" IS NOT NULL AND \"CompletedAt\" IS NULL AND NOT \"IsDeleted\"");
        builder.HasIndex(t => t.AssignedToId).HasFilter("\"AssignedToId\" IS NOT NULL");
        builder.HasIndex(t => new { t.CreatedById, t.CompletedAt }).HasFilter("NOT \"IsDeleted\"");

        builder.HasOne(t => t.Project)
            .WithMany(p => p.Tasks)
            .HasForeignKey(t => t.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(t => t.CreatedBy)
            .WithMany()
            .HasForeignKey(t => t.CreatedById)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(t => t.AssignedTo)
            .WithMany()
            .HasForeignKey(t => t.AssignedToId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
