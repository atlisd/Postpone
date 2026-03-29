using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data.Configurations;

public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Id).HasDefaultValueSql("gen_random_uuid()");
        builder.Property(u => u.Email).IsRequired();
        builder.Property(u => u.EmailNormalized).IsRequired();
        builder.Property(u => u.PasswordHash).IsRequired(false);
        builder.Property(u => u.DisplayName).IsRequired();
        builder.Property(u => u.Timezone).IsRequired().HasDefaultValue("UTC");
        builder.Property(u => u.Locale).IsRequired().HasDefaultValue("en");
        builder.Property(u => u.IsAdmin).HasDefaultValue(false);
        builder.Property(u => u.MustChangePassword).HasDefaultValue(true);
        builder.Property(u => u.CreatedAt).HasDefaultValueSql("now()");
        builder.Property(u => u.UpdatedAt).HasDefaultValueSql("now()");

        builder.Property(u => u.InvitationTokenHash).IsRequired(false);
        builder.Property(u => u.InvitationExpiresAt).IsRequired(false);
        builder.Property(u => u.PasswordResetTokenHash).IsRequired(false);
        builder.Property(u => u.PasswordResetExpiresAt).IsRequired(false);

        builder.HasIndex(u => u.EmailNormalized).IsUnique();
        builder.HasIndex(u => u.InvitationTokenHash)
            .HasFilter("\"InvitationTokenHash\" IS NOT NULL");
        builder.HasIndex(u => u.PasswordResetTokenHash)
            .HasFilter("\"PasswordResetTokenHash\" IS NOT NULL");
    }
}
