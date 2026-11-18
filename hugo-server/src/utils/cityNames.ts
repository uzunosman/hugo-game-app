// Masa adları: masa açılırken sorulmaz, açık masalarda tekrar etmeyen bir yabancı şehir adı verilir (sahip değiştirebilir)
export const CITY_NAMES = [
    'Lizbon', 'Kyoto', 'Reykjavik', 'Buenos Aires', 'Prag', 'Viyana', 'Havana', 'Marakeş', 'Kopenhag', 'Oslo',
    'Seul', 'Sidney', 'Montreal', 'Barselona', 'Napoli', 'Dublin', 'Edinburg', 'Budapeşte', 'Krakov', 'Porto',
    'Sevilla', 'Floransa', 'Amsterdam', 'Brüksel', 'Zürih', 'Cenevre', 'Münih', 'Hamburg', 'Stockholm', 'Helsinki',
    'Tallinn', 'Riga', 'Varşova', 'Atina', 'Kahire', 'Tunus', 'Dubai', 'Mumbai', 'Bangkok', 'Hanoi',
    'Singapur', 'Tokyo', 'Osaka', 'Şangay', 'Vancouver', 'Toronto', 'Chicago', 'New Orleans', 'Mexico City', 'Lima',
    'Santiago', 'Bogota', 'Rio', 'Kapstadt', 'Nairobi', 'Zanzibar', 'Bali', 'Melbourne', 'Auckland', 'Honolulu',
];

export const pickCity = (used: Iterable<string>): string => {
    const taken = new Set(used);
    const free = CITY_NAMES.filter(n => !taken.has(n));
    if (free.length) return free[Math.floor(Math.random() * free.length)];
    // Hepsi doluysa numaralı
    for (let i = 2; ; i++) {
        const name = `${CITY_NAMES[Math.floor(Math.random() * CITY_NAMES.length)]} ${i}`;
        if (!taken.has(name)) return name;
    }
};
