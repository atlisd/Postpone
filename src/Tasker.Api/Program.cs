using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Tasker.Api.Data;
using Tasker.Api.Extensions;
using Tasker.Api.Hubs;
using Tasker.Api.Middleware;
using Tasker.Api.Models.Entities;
using Tasker.Api.Services;

if (args.FirstOrDefault() == "generate-admin-reset-link")
{
    var config = new ConfigurationBuilder()
        .AddJsonFile("appsettings.json", optional: true)
        .AddEnvironmentVariables()
        .Build();

    var connectionString = config.GetConnectionString("Default")
        ?? throw new InvalidOperationException("Connection string 'Default' not configured.");
    var appUrl = config["App:Url"] ?? "http://localhost:5173";
    var emailFilter = args.SkipWhile(a => a != "--email").Skip(1).FirstOrDefault();

    var optionsBuilder = new DbContextOptionsBuilder<TaskerDbContext>();
    optionsBuilder.UseNpgsql(connectionString);

    await using var db = new TaskerDbContext(optionsBuilder.Options);

    var query = db.Users.Where(u => u.IsAdmin);
    if (emailFilter is not null)
        query = query.Where(u => u.EmailNormalized == emailFilter.Trim().ToUpperInvariant());

    var admins = await query.ToListAsync();

    if (admins.Count == 0)
    {
        Console.Error.WriteLine("No admin user found.");
        return;
    }

    if (admins.Count > 1)
    {
        Console.Error.WriteLine("Multiple admin accounts found. Specify one with --email <email>:");
        foreach (var a in admins)
            Console.Error.WriteLine($"  {a.Email}");
        return;
    }

    var admin = admins[0];
    var tokenService = new TokenService(config);
    var (token, hash) = tokenService.GenerateSecureToken();

    admin.PasswordResetTokenHash = hash;
    admin.PasswordResetExpiresAt = DateTime.UtcNow.AddHours(24);
    await db.SaveChangesAsync();

    Console.WriteLine($"{appUrl.TrimEnd('/')}/reset-password?token={token}");
    return;
}

Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((ctx, services, config) =>
    {
        config
            .ReadFrom.Configuration(ctx.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext()
            .WriteTo.Console(
                outputTemplate: ctx.HostingEnvironment.IsDevelopment()
                    ? "[{Timestamp:HH:mm:ss} {Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}"
                    : "{Timestamp:o} [{Level:u3}] {SourceContext}: {Message:lj}{NewLine}{Exception}");
    });

    builder.Services.AddControllers();
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();
    builder.Services.AddTaskerServices(builder.Configuration);

    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        });
    });

    var app = builder.Build();

    // Apply migrations
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<TaskerDbContext>();
        await db.Database.MigrateAsync();
    }

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI();
    }

    app.UseMiddleware<ExceptionHandlingMiddleware>();
    app.UseSerilogRequestLogging(opts =>
    {
        opts.MessageTemplate = "HTTP {RequestMethod} {RequestPath} responded {StatusCode} in {Elapsed:0.0000}ms";
    });
    app.UseCors();
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseAuthorization();
    app.MapControllers();
    app.MapHub<SyncHub>("/hubs/sync");
    app.MapHealthChecks("/health", new HealthCheckOptions
    {
        ResponseWriter = async (context, report) =>
        {
            context.Response.ContentType = "application/json";
            var result = System.Text.Json.JsonSerializer.Serialize(new
            {
                status = report.Status.ToString(),
                checks = report.Entries.Select(e => new { name = e.Key, status = e.Value.Status.ToString() })
            });
            await context.Response.WriteAsync(result);
        }
    });

    app.Run();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}
