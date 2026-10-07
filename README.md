# Office Foosball

A browser foosball game with two modes:

- **Local/offline**: preserves the original single-machine modes, bots and multi-keyboard play.
- **Online**: ASP.NET Core + SignalR rooms for 1v1 or 2v2 play from separate laptops.

## Architecture

The host browser remains authoritative for the existing 120 Hz game simulation. Other players send only control events to the host through SignalR. The host sends compact game-state snapshots to the other players about 20 times per second.

The ASP.NET Core server only manages rooms, seat assignment and message routing in memory. No database is required.

## Run locally

Requires the .NET 10 SDK.

```bash
dotnet run
```

Open the URL printed by ASP.NET Core.

For the browser SignalR client, the Docker image vendors the Microsoft SignalR JavaScript package. A CDN fallback is present when running directly with `dotnet run`.

## Docker

```bash
docker build -t office-foosball .
docker run --rm -p 8080:8080 office-foosball
```

Open `http://localhost:8080`.

## Online play

1. One player enters a name, chooses 1v1 or 2v2, and clicks **Create room**.
2. Share the five-character room code or invite URL.
3. Other players enter their names and join.
4. The host starts once all required seats are connected.

Every online laptop can use the same keys:

- Slide: `Left/Right` or `A/D`
- Tilt: `Up/Down` or `W/S`
- Kick: `Space` or `E`
- Switch rod: `Q`
- Pick rod: `1`–`4`
- Leave room: `M`
- Host: `Esc` pause, `Backspace` re-serve/skip replay, `R` rematch

## Azure Container Apps

The included Dockerfile listens on port `8080`.

For this casual office game, keep it deliberately small:

- 0.25 vCPU
- 0.5 GiB memory
- min replicas: 0
- max replicas: 1
- external HTTP ingress
- target port: 8080

**Keep max replicas at 1.** Room membership and host routing are stored in process memory. Multiple replicas would require shared state/backplane infrastructure and are intentionally out of scope for this fun project.

## CI

GitHub Actions builds both the .NET project and Docker image on every push and pull request.
