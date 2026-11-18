-- Oyun geçmişi (admin → Geçmiş): oyunun / elin olaylarını ve el başı dağıtımlarını hızlı bulmak için
CREATE INDEX events_game_round ON events ((data->>'oyun'), (data->>'el')) WHERE data ? 'oyun';
CREATE INDEX events_masa_olay ON events ((data->>'olay')) WHERE type = 'masa';
