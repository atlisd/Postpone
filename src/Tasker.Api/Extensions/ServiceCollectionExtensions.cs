using System.Text;
using System.Threading.RateLimiting;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Tasker.Api.Data;
using Tasker.Api.Services;
using Tasker.Api.Validators;

namespace Tasker.Api.Extensions;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddTaskerServices(this IServiceCollection services, IConfiguration configuration)
    {
        // Database
        services.AddDbContext<TaskerDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("Default")));

        // JWT Authentication
        var jwtSecret = configuration["Jwt:Secret"]
            ?? throw new InvalidOperationException("Jwt:Secret is required");

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = configuration["Jwt:Issuer"] ?? "tasker-api",
                    ValidAudience = configuration["Jwt:Audience"] ?? "tasker-client",
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
                    ClockSkew = TimeSpan.FromSeconds(30)
                };

                // Allow SignalR to receive the JWT via query string
                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        var path = context.HttpContext.Request.Path;
                        if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                        {
                            context.Token = accessToken;
                        }
                        return Task.CompletedTask;
                    }
                };
            });

        services.AddAuthorization();

        // FluentValidation
        services.AddFluentValidationAutoValidation();
        services.AddValidatorsFromAssemblyContaining<LoginRequestValidator>();

        // Rate limiting
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            // Strict limit for auth endpoints (prevent brute-force)
            options.AddFixedWindowLimiter("auth", opt =>
            {
                opt.PermitLimit = 10;
                opt.Window = TimeSpan.FromMinutes(1);
                opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
                opt.QueueLimit = 0;
            });

            // General API limit per IP
            options.AddFixedWindowLimiter("api", opt =>
            {
                opt.PermitLimit = 300;
                opt.Window = TimeSpan.FromMinutes(1);
                opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
                opt.QueueLimit = 0;
            });
        });

        // Health checks
        services.AddHealthChecks()
            .AddNpgSql(configuration.GetConnectionString("Default")
                ?? throw new InvalidOperationException("Connection string required"));

        // SignalR
        services.AddSignalR();

        // Services
        services.AddScoped<ITokenService, TokenService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IProjectAccessService, ProjectAccessService>();
        services.AddScoped<IRecurrenceService, RecurrenceService>();
        services.AddScoped<ISyncService, SyncService>();
        services.AddSingleton<IPushoverClient, PushoverClient>();
        services.AddHttpClient();

        // Background jobs
        services.AddHostedService<BackgroundJobs.RecurrenceGeneratorJob>();
        services.AddHostedService<BackgroundJobs.NotificationSchedulerJob>();

        return services;
    }
}
