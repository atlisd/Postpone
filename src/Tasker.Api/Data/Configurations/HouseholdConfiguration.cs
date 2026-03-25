using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data.Configurations;

public class HouseholdConfiguration : IEntityTypeConfiguration<Household>
{
    public void Configure(EntityTypeBuilder<Household> builder)
    {
        builder.ToTable("households");
        builder.HasKey(h => h.Id);
        builder.Property(h => h.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(h => h.Name).IsRequired();
        builder.Property(h => h.InviteCode).IsRequired();
        builder.Property(h => h.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(h => h.UpdatedAt).HasDefaultValueSql("now()");

        builder.HasIndex(h => h.InviteCode).IsUnique();

        builder.HasOne(h => h.CreatedBy)
            .WithMany()
            .HasForeignKey(h => h.CreatedById)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public class HouseholdMemberConfiguration : IEntityTypeConfiguration<HouseholdMember>
{
    public void Configure(EntityTypeBuilder<HouseholdMember> builder)
    {
        builder.ToTable("household_members");
        builder.HasKey(hm => new { hm.HouseholdId, hm.UserId });
        builder.Property(hm => hm.Role).IsRequired().HasDefaultValue("member");
        builder.Property(hm => hm.JoinedAt).HasDefaultValueSql("now()");

        builder.HasOne(hm => hm.Household)
            .WithMany(h => h.Members)
            .HasForeignKey(hm => hm.HouseholdId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(hm => hm.User)
            .WithMany(u => u.HouseholdMemberships)
            .HasForeignKey(hm => hm.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(hm => hm.UserId);
    }
}
