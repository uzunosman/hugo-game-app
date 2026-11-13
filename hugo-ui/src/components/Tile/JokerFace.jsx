// Sahte okey yüzü: büyük yıldız, altında dört renk noktası (kırmızı, sarı, mavi, siyah)
const JokerFace = () => (
    <span className="joker-face" aria-label="Sahte okey">
        <span className="joker-star" aria-hidden="true">★</span>
        <span className="joker-dots" aria-hidden="true"><i /><i /><i /><i /></span>
    </span>
);

export default JokerFace;
