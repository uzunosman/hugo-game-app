import { v4 as uuidv4 } from 'uuid';
import { Player } from './Player';
import { Game } from './Game';

export enum RoomStatus {
    WAITING = 'waiting',
    PLAYING = 'playing',
    FINISHED = 'finished'
}

export class Room {
    id: string;
    no = 0;           // masa numarası (#101701): ekranda görünür, oyun kaydında masayı tanımlar
    name: string;
    owner: Player;
    players: Player[];
    status: RoomStatus;
    game: Game | null;
    maxPlayers: number;
    createdAt: Date;
    lastActivityAt: number;   // son insan hamlesi (ms); uzun süre boşta kalan masa arşivlenir
    finishedAt: number | null; // oyun bitip masa beklemeye döndüğü an; yeniden başlamazsa arşivlenir

    constructor(name: string, owner: Player, maxPlayers: number = 4) {
        this.id = uuidv4();
        this.name = name;
        this.owner = owner;
        this.players = [owner];
        this.status = RoomStatus.WAITING;
        this.game = null;
        this.maxPlayers = maxPlayers;
        this.createdAt = new Date();
        this.lastActivityAt = Date.now();
        this.finishedAt = null;

        // Oda sahibini odaya ekle
        owner.setRoomId(this.id);
    }

    addPlayer(player: Player): boolean {
        if (this.players.length >= this.maxPlayers) {
            return false;
        }

        if (this.status !== RoomStatus.WAITING) {
            return false;
        }

        this.players.push(player);
        player.setRoomId(this.id);
        return true;
    }

    removePlayer(playerId: string): Player | undefined {
        const playerIndex = this.players.findIndex(player => player.id === playerId);
        if (playerIndex !== -1) {
            const [removedPlayer] = this.players.splice(playerIndex, 1);
            removedPlayer.setRoomId(null);

            // Oda sahibi ayrıldıysa sahiplik masadaki bir insana geçer (yapay zekâ hiç sahip olmaz)
            if (this.owner.id === playerId) this.owner = this.firstHuman() || this.owner;

            return removedPlayer;
        }
        return undefined;
    }

    startGame(): boolean {
        if (this.players.length !== this.maxPlayers) {
            return false;
        }

        if (this.status !== RoomStatus.WAITING) {
            return false;
        }

        this.game = new Game(this.players);
        this.finishedAt = null;
        this.status = RoomStatus.PLAYING;
        return true;
    }

    endGame(): void {
        if (this.status === RoomStatus.PLAYING) {
            this.status = RoomStatus.FINISHED;

            // Oyuncuların taşlarını temizle
            this.players.forEach(player => {
                player.clearTiles();
            });
        }
    }

    resetGame(): void {
        this.status = RoomStatus.WAITING;
        this.game = null;

        // Oyuncuların hazır durumunu sıfırla
        this.players.forEach(player => {
            player.setReady(false);
            player.setTurn(false);
        });
    }

    firstHuman(): Player | undefined {
        return this.players.find(p => !p.isBot);
    }

    isPlayerInRoom(playerId: string): boolean {
        return this.players.some(player => player.id === playerId);
    }

    getPlayerById(playerId: string): Player | undefined {
        return this.players.find(player => player.id === playerId);
    }

    getPlayerBySocketId(socketId: string): Player | undefined {
        return this.players.find(player => player.socketId === socketId);
    }

    areAllPlayersReady(): boolean {
        return this.players.length === this.maxPlayers &&
            this.players.every(player => player.isReady);
    }

    toJSON(): Record<string, any> {
        return {
            id: this.id,
            no: this.no,
            name: this.name,
            owner: this.owner.toPublicJSON(),
            players: this.players.map(player => player.toPublicJSON()),
            status: this.status,
            maxPlayers: this.maxPlayers,
            createdAt: this.createdAt,
            game: this.game ? this.game.toPublicJSON() : null
        };
    }
} 