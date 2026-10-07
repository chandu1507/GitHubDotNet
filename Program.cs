using OfficeFoosball.Hubs;
using OfficeFoosball.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 64 * 1024;
});
builder.Services.AddSingleton<RoomRegistry>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapHub<GameHub>("/hubs/game");
app.MapFallbackToFile("index.html");

app.Run();
