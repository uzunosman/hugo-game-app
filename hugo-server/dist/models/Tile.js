"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tile = exports.TileStatus = exports.TileColor = void 0;
const uuid_1 = require("uuid");
var TileColor;
(function (TileColor) {
    TileColor["RED"] = "red";
    TileColor["YELLOW"] = "yellow";
    TileColor["BLUE"] = "blue";
    TileColor["BLACK"] = "black";
    TileColor["JOKER"] = "joker";
    TileColor["PURPLE"] = "purple";
})(TileColor || (exports.TileColor = TileColor = {}));
var TileStatus;
(function (TileStatus) {
    TileStatus["IN_DECK"] = "in_deck";
    TileStatus["IN_HAND"] = "in_hand";
    TileStatus["DISCARDED"] = "discarded";
    TileStatus["IN_SET"] = "in_set";
    TileStatus["INDICATOR"] = "indicator";
})(TileStatus || (exports.TileStatus = TileStatus = {}));
class Tile {
    constructor(color, value, isJoker = false) {
        this.id = (0, uuid_1.v4)();
        this.color = color;
        this.value = value;
        this.status = TileStatus.IN_DECK;
        this.isVisible = false;
        this.isJoker = isJoker;
    }
    setStatus(status) {
        this.status = status;
    }
    setVisible(visible) {
        this.isVisible = visible;
    }
    toJSON() {
        return {
            id: this.id,
            color: this.color,
            value: this.value,
            status: this.status,
            isVisible: this.isVisible,
            isJoker: this.isJoker
        };
    }
    toPublicJSON() {
        // Sadece görünür taşların değerlerini göster
        if (this.isVisible) {
            return this.toJSON();
        }
        else {
            return {
                id: this.id,
                status: this.status,
                isVisible: false
            };
        }
    }
}
exports.Tile = Tile;
