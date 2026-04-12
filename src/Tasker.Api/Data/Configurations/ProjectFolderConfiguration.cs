using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data.Configurations;

public class ProjectFolderConfiguration : IEntityTypeConfiguration<ProjectFolder>
{
    public void Configure(EntityTypeBuilder<ProjectFolder> builder)
    {
        builder.ToTable("project_folders");
        builder.HasKey(f => f.Id);
        builder.Property(f => f.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(f => f.Name).IsRequired();
        builder.Property(f => f.IsCollapsed).HasDefaultValue(false);
        builder.Property(f => f.SortOrder).HasDefaultValue(int.MaxValue);
        builder.Property(f => f.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(f => f.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasIndex(f => f.OwnerId);

        builder.HasOne(f => f.Owner)
            .WithMany()
            .HasForeignKey(f => f.OwnerId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
