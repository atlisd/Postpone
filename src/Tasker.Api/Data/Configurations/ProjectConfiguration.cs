using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data.Configurations;

public class ProjectConfiguration : IEntityTypeConfiguration<Project>
{
    public void Configure(EntityTypeBuilder<Project> builder)
    {
        builder.ToTable("projects");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(p => p.Name).IsRequired();
        builder.Property(p => p.Color).IsRequired().HasDefaultValue("#4A90D9");
        builder.Property(p => p.IsArchived).HasDefaultValue(false);
        builder.Property(p => p.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(p => p.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasIndex(p => p.OwnerId);
        builder.HasIndex(p => p.HouseholdId).HasFilter("\"HouseholdId\" IS NOT NULL");

        builder.HasOne(p => p.Owner)
            .WithMany(u => u.OwnedProjects)
            .HasForeignKey(p => p.OwnerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(p => p.Household)
            .WithMany(h => h.Projects)
            .HasForeignKey(p => p.HouseholdId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public class ProjectShareConfiguration : IEntityTypeConfiguration<ProjectShare>
{
    public void Configure(EntityTypeBuilder<ProjectShare> builder)
    {
        builder.ToTable("project_shares");
        builder.HasKey(ps => new { ps.ProjectId, ps.UserId });
        builder.Property(ps => ps.Permission).IsRequired().HasDefaultValue("edit");
        builder.Property(ps => ps.CreatedAt).HasDefaultValueSql("now()");

        builder.HasOne(ps => ps.Project)
            .WithMany(p => p.Shares)
            .HasForeignKey(ps => ps.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(ps => ps.User)
            .WithMany(u => u.ProjectShares)
            .HasForeignKey(ps => ps.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
