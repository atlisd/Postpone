using Tasker.Api.Services;

namespace Tasker.Api.BackgroundJobs;

public class RecurrenceGeneratorJob(IServiceProvider serviceProvider, ILogger<RecurrenceGeneratorJob> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Recurrence generator job started, interval: {Interval}", Interval);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = serviceProvider.CreateScope();
                var recurrenceService = scope.ServiceProvider.GetRequiredService<IRecurrenceService>();
                await recurrenceService.GenerateInstancesAsync();
                logger.LogInformation("Recurrence generation completed");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Recurrence generation failed");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }
}
