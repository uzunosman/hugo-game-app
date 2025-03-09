import { v4 as uuidv4 } from 'uuid';

export enum TileColor {
    RED = 'red',
    YELLOW = 'yellow',
    BLUE = 'blue',
    BLACK = 'black',
    JOKER = 'joker',
    PURPLE = 'purple'
}

export enum TileStatus {
    IN_DECK = 'in_deck',
    IN_HAND = 'in_hand',
    DISCARDED = 'discarded',
    IN_SET = 'in_set',
    INDICATOR = 'indicator'
}

export class Tile {
    id: string;
    color: TileColor;
    value: number | string;
    status: TileStatus;
    isVisible: boolean;
    isJoker: boolean;

    constructor(color: TileColor, value: number | string, isJoker: boolean = false) {
        this.id = uuidv4();
        this.color = color;
        this.value = value;
        this.status = TileStatus.IN_DECK;
        this.isVisible = false;
        this.isJoker = isJoker;
    }

    setStatus(status: TileStatus): void {
        this.status = status;
    }

    setVisible(visible: boolean): void {
        this.isVisible = visible;
    }

    toJSON(): Record<string, any> {
        return {
            id: this.id,
            color: this.color,
            value: this.value,
            status: this.status,
            isVisible: this.isVisible,
            isJoker: this.isJoker
        };
    }

    toPublicJSON(): Record<string, any> {
        // Sadece görünür taşların değerlerini göster
        if (this.isVisible) {
            return this.toJSON();
        } else {
            return {
                id: this.id,
                status: this.status,
                isVisible: false
            };
        }
    }
} 