using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using OfficeFoosball.Services;

namespace OfficeFoosball.Hubs;

public sealed class GameHub(RoomRegistry rooms) : Hub
{
    private static string GroupName(string roomCode) => $"room:{roomCode.ToUpperInvariant()}";

    public async Task<RoomJoinResult> CreateRoom(string playerName, string mode)
    {
        try
        {
            var result = rooms.Create(Context.ConnectionId, playerName, mode);
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(result.RoomCode));
            await Clients.Group(GroupName(result.RoomCode)).SendAsync("LobbyUpdated", result.Room);
            return result;
        }
        catch (RoomException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task<RoomJoinResult> JoinRoom(string roomCode, string playerName)
    {
        try
        {
            var result = rooms.Join(Context.ConnectionId, roomCode, playerName);
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(result.RoomCode));
            await Clients.Group(GroupName(result.RoomCode)).SendAsync("LobbyUpdated", result.Room);
            return result;
        }
        catch (RoomException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task StartMatch(string roomCode, MatchOptions options)
    {
        try
        {
            var context = rooms.RequireConnection(Context.ConnectionId, roomCode);
            if (context.Seat.Id != "P1")
                throw new RoomException("Only the room host can start the match.");

            var room = rooms.Snapshot(context.Room);
            if (!room.CanStart)
                throw new RoomException($"Waiting for players ({room.ConnectedPlayers}/{room.RequiredPlayers}).");

            var target = Math.Clamp(options.Target, 1, 20);
            var payload = new
            {
                roomCode = room.RoomCode,
                mode = room.Mode,
                target,
                auto = options.Auto,
                sound = options.Sound,
                seats = room.Seats
            };

            await Clients.Group(GroupName(room.RoomCode)).SendAsync("MatchStarted", payload);
        }
        catch (RoomException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task SendInput(string roomCode, string action, bool pressed)
    {
        try
        {
            var context = rooms.RequireConnection(Context.ConnectionId, roomCode);
            var host = context.Room.Seats["P1"];
            if (host.ConnectionId is null)
                throw new RoomException("Room host is not connected.");

            await Clients.Client(host.ConnectionId).SendAsync("PlayerInput", context.Seat.Id, action, pressed);
        }
        catch (RoomException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task PublishState(string roomCode, JsonElement snapshot)
    {
        try
        {
            var context = rooms.RequireConnection(Context.ConnectionId, roomCode);
            if (context.Seat.Id != "P1")
                throw new RoomException("Only the host can publish game state.");

            await Clients.GroupExcept(GroupName(context.Room.Code), [Context.ConnectionId])
                .SendAsync("StateSnapshot", snapshot);
        }
        catch (RoomException ex)
        {
            throw new HubException(ex.Message);
        }
    }

    public async Task LeaveRoom()
    {
        var result = rooms.Leave(Context.ConnectionId);
        if (result.RoomCode is null) return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(result.RoomCode));

        if (result.HostClosed)
        {
            await Clients.Group(GroupName(result.RoomCode)).SendAsync("RoomClosed", "The host left the room.");
        }
        else
        {
            await Clients.Group(GroupName(result.RoomCode)).SendAsync("PlayerLeft", result.SeatId);
            if (result.Room is not null)
                await Clients.Group(GroupName(result.RoomCode)).SendAsync("LobbyUpdated", result.Room);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var result = rooms.Leave(Context.ConnectionId);
        if (result.RoomCode is not null)
        {
            if (result.HostClosed)
            {
                await Clients.Group(GroupName(result.RoomCode)).SendAsync("RoomClosed", "The host disconnected.");
            }
            else
            {
                await Clients.Group(GroupName(result.RoomCode)).SendAsync("PlayerLeft", result.SeatId);
                if (result.Room is not null)
                    await Clients.Group(GroupName(result.RoomCode)).SendAsync("LobbyUpdated", result.Room);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }
}

public sealed record MatchOptions(int Target, bool Auto, bool Sound);
