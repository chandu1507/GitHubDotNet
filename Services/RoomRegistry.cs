using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace OfficeFoosball.Services;

public sealed class RoomRegistry
{
    private const string Alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, ConnectionSeat> _connections = new(StringComparer.Ordinal);

    public RoomJoinResult Create(string connectionId, string? playerName, string? mode)
    {
        var normalizedMode = NormalizeMode(mode);
        var name = NormalizeName(playerName);

        for (var attempt = 0; attempt < 20; attempt++)
        {
            var code = GenerateCode();
            var room = GameRoom.Create(code, normalizedMode);
            var host = room.Seats["P1"];
            host.Connect(connectionId, name);

            if (!_rooms.TryAdd(code, room))
                continue;

            _connections[connectionId] = new ConnectionSeat(code, host.Id);
            return new RoomJoinResult(code, host.Id, true, Snapshot(room));
        }

        throw new InvalidOperationException("Could not allocate a room code.");
    }

    public RoomJoinResult Join(string connectionId, string? roomCode, string? playerName)
    {
        var room = GetRoom(roomCode);
        var name = NormalizeName(playerName);

        lock (room.Sync)
        {
            var slot = room.ActiveSeatIds
                .Select(id => room.Seats[id])
                .FirstOrDefault(s => !s.Connected);

            if (slot is null)
                throw new RoomException("That room is full.");

            slot.Connect(connectionId, name);
            _connections[connectionId] = new ConnectionSeat(room.Code, slot.Id);
            return new RoomJoinResult(room.Code, slot.Id, slot.Id == "P1", SnapshotUnsafe(room));
        }
    }

    public ConnectionContext RequireConnection(string connectionId, string? roomCode = null)
    {
        if (!_connections.TryGetValue(connectionId, out var mapped))
            throw new RoomException("This connection is not in a room.");

        if (!string.IsNullOrWhiteSpace(roomCode) && !mapped.RoomCode.Equals(roomCode.Trim(), StringComparison.OrdinalIgnoreCase))
            throw new RoomException("Connection does not belong to that room.");

        var room = GetRoom(mapped.RoomCode);
        lock (room.Sync)
        {
            var seat = room.Seats[mapped.SeatId];
            if (!seat.Connected || seat.ConnectionId != connectionId)
                throw new RoomException("Player seat is no longer connected.");

            return new ConnectionContext(room, seat);
        }
    }

    public RoomSnapshot Snapshot(GameRoom room)
    {
        lock (room.Sync)
            return SnapshotUnsafe(room);
    }

    public LeaveResult Leave(string connectionId)
    {
        if (!_connections.TryRemove(connectionId, out var mapped))
            return LeaveResult.None;

        if (!_rooms.TryGetValue(mapped.RoomCode, out var room))
            return LeaveResult.None;

        lock (room.Sync)
        {
            if (!room.Seats.TryGetValue(mapped.SeatId, out var seat) || seat.ConnectionId != connectionId)
                return LeaveResult.None;

            var wasHost = seat.Id == "P1";
            seat.Disconnect();

            if (wasHost)
            {
                _rooms.TryRemove(room.Code, out _);
                foreach (var other in room.Seats.Values.Where(s => s.Connected && s.ConnectionId is not null))
                    _connections.TryRemove(other.ConnectionId!, out _);
                return new LeaveResult(room.Code, seat.Id, true, null);
            }

            return new LeaveResult(room.Code, seat.Id, false, SnapshotUnsafe(room));
        }
    }

    private GameRoom GetRoom(string? roomCode)
    {
        var code = (roomCode ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length == 0 || !_rooms.TryGetValue(code, out var room))
            throw new RoomException("Room not found.");
        return room;
    }

    private static string NormalizeMode(string? mode) =>
        string.Equals(mode, "1v1", StringComparison.OrdinalIgnoreCase) ? "1v1" :
        string.Equals(mode, "2v2", StringComparison.OrdinalIgnoreCase) ? "2v2" :
        throw new RoomException("Mode must be 1v1 or 2v2.");

    private static string NormalizeName(string? playerName)
    {
        var value = (playerName ?? string.Empty).Trim();
        if (value.Length == 0) value = "Player";
        return value.Length <= 14 ? value : value[..14];
    }

    private static string GenerateCode()
    {
        Span<char> chars = stackalloc char[5];
        for (var i = 0; i < chars.Length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        return new string(chars);
    }

    private static RoomSnapshot SnapshotUnsafe(GameRoom room)
    {
        var seats = room.ActiveSeatIds
            .Select(id => room.Seats[id])
            .Select(s => new PlayerSeatSnapshot(s.Id, s.Team, s.Name, s.Connected))
            .ToArray();

        return new RoomSnapshot(
            room.Code,
            room.Mode,
            seats,
            seats.All(s => s.Connected),
            seats.Count(s => s.Connected),
            seats.Length);
    }
}

public sealed class GameRoom
{
    public object Sync { get; } = new();
    public string Code { get; }
    public string Mode { get; }
    public IReadOnlyList<string> ActiveSeatIds { get; }
    public Dictionary<string, PlayerSeat> Seats { get; }

    private GameRoom(string code, string mode, IReadOnlyList<string> activeSeatIds)
    {
        Code = code;
        Mode = mode;
        ActiveSeatIds = activeSeatIds;
        Seats = new Dictionary<string, PlayerSeat>(StringComparer.OrdinalIgnoreCase)
        {
            ["P1"] = new("P1", "A"),
            ["P2"] = new("P2", "A"),
            ["P3"] = new("P3", "B"),
            ["P4"] = new("P4", "B")
        };
    }

    public static GameRoom Create(string code, string mode) =>
        new(code, mode, mode == "1v1" ? ["P1", "P3"] : ["P1", "P2", "P3", "P4"]);
}

public sealed class PlayerSeat(string id, string team)
{
    public string Id { get; } = id;
    public string Team { get; } = team;
    public string Name { get; private set; } = id;
    public string? ConnectionId { get; private set; }
    public bool Connected => ConnectionId is not null;

    public void Connect(string connectionId, string name)
    {
        ConnectionId = connectionId;
        Name = name;
    }

    public void Disconnect() => ConnectionId = null;
}

public sealed record ConnectionSeat(string RoomCode, string SeatId);
public sealed record ConnectionContext(GameRoom Room, PlayerSeat Seat);
public sealed record PlayerSeatSnapshot(string Id, string Team, string Name, bool Connected);
public sealed record RoomSnapshot(string RoomCode, string Mode, IReadOnlyList<PlayerSeatSnapshot> Seats, bool CanStart, int ConnectedPlayers, int RequiredPlayers);
public sealed record RoomJoinResult(string RoomCode, string SeatId, bool IsHost, RoomSnapshot Room);
public sealed record LeaveResult(string? RoomCode, string? SeatId, bool HostClosed, RoomSnapshot? Room)
{
    public static LeaveResult None { get; } = new(null, null, false, null);
}

public sealed class RoomException(string message) : Exception(message);
