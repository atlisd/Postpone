using Microsoft.EntityFrameworkCore;
using Tasker.Api.Models.Entities;

namespace Tasker.Api.Data;

public class TaskerDbContext(DbContextOptions<TaskerDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Household> Households => Set<Household>();
    public DbSet<HouseholdMember> HouseholdMembers => Set<HouseholdMember>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectShare> ProjectShares => Set<ProjectShare>();
    public DbSet<TodoTask> Tasks => Set<TodoTask>();
    public DbSet<Subtask> Subtasks => Set<Subtask>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<TaskTag> TaskTags => Set<TaskTag>();
    public DbSet<RecurrenceException> RecurrenceExceptions => Set<RecurrenceException>();
    public DbSet<ExceptionSubtaskCompletion> ExceptionSubtaskCompletions => Set<ExceptionSubtaskCompletion>();
    public DbSet<NotificationLog> NotificationLogs => Set<NotificationLog>();
    public DbSet<TaskReminder> TaskReminders => Set<TaskReminder>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskerDbContext).Assembly);
    }

    public override int SaveChanges()
    {
        SetTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        SetTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void SetTimestamps()
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Added)
            {
                if (entry.Entity is User u) { u.CreatedAt = now; u.UpdatedAt = now; }
                else if (entry.Entity is Household h) { h.CreatedAt = now; h.UpdatedAt = now; }
                else if (entry.Entity is Project p) { p.CreatedAt = now; p.UpdatedAt = now; }
                else if (entry.Entity is TodoTask t) { t.CreatedAt = now; t.UpdatedAt = now; }
                else if (entry.Entity is RecurrenceException re) { re.CreatedAt = now; re.UpdatedAt = now; }
            }
            else if (entry.State == EntityState.Modified)
            {
                if (entry.Entity is User u) u.UpdatedAt = now;
                else if (entry.Entity is Household h) h.UpdatedAt = now;
                else if (entry.Entity is Project p) p.UpdatedAt = now;
                else if (entry.Entity is TodoTask t) t.UpdatedAt = now;
                else if (entry.Entity is RecurrenceException re) re.UpdatedAt = now;
            }
        }
    }
}
