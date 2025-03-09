import { useEffect } from 'react';
import socketService from '../services/socketService';

/**
 * Oyun socket bağlantıları ve dinleyicileri için hook
 * @param {Object} player - Oyuncu bilgisi
 * @param {Object} room - Oda bilgisi
 * @param {Function} setError - Hata mesajını güncelleyen fonksiyon
 * @returns {Object} - Socket işlevleri
 */
const useGameSocket = (player, room, setError) => {
    useEffect(() => {
        // Oyun başlangıcında taşları ve oyun durumunu dinle
        // Taşlar ve oyun durumu zaten useGameState hook'unda dinleniyor
        // Bu nedenle burada tekrar istek göndermemize gerek yok

        // Temizleme işlemi
        return () => {
            // Socket bağlantılarını temizle
        };
    }, []);

    /**
     * Taş çekme işlemi
     * @param {Boolean} fromDiscard - Atılan taşlardan mı çekiliyor
     * @param {Function} callback - İşlem sonrası çağrılacak fonksiyon
     */
    const drawTile = (fromDiscard, callback) => {
        socketService.drawTile(fromDiscard, callback);
    };

    /**
     * Taş atma işlemi
     * @param {String} tileId - Atılacak taşın ID'si
     * @param {Function} callback - İşlem sonrası çağrılacak fonksiyon
     */
    const discardTile = (tileId, callback) => {
        socketService.discardTile(tileId, callback);
    };

    return {
        drawTile,
        discardTile
    };
};

export default useGameSocket; 