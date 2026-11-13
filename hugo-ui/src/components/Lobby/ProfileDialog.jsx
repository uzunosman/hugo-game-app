import { useEffect, useRef, useState } from 'react';
import { avatarFromSeed, randomSeeds } from '../../utils/avatar';

const PROFILE_KEY = 'hugo.profile'; // bu tarayıcıda son kullanılan ad ve avatar (yalnızca kolaylık)
const readProfile = () => { try { return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {}; } catch { return {}; } };
const writeProfile = (p) => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* depolama kapalı */ } };
const CHOICES = 8;

// Masaya oturmadan önce ad ve avatar: avatar varsayılan olarak atanır, istenirse değiştirilir
function ProfileDialog({ title, busy, error, onSubmit, onCancel }) {
    const saved = useRef(readProfile()).current;
    const [name, setName] = useState(saved.name || '');
    const [avatar, setAvatar] = useState(() => saved.avatar || randomSeeds(1)[0]);
    const [choices, setChoices] = useState(() => [avatar, ...randomSeeds(CHOICES - 1)]);
    const [picking, setPicking] = useState(false);
    const [localError, setLocalError] = useState('');

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [busy, onCancel]);

    const submit = (e) => {
        e.preventDefault();
        const clean = name.trim();
        if (!clean) { setLocalError('Masada görünecek bir ad yaz'); return; }
        writeProfile({ name: clean, avatar });
        onSubmit(clean, avatar);
    };

    return (
        <div className="profile-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
            <form className="panel profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" onSubmit={submit}>
                <h2 className="panel-title" id="profile-title">{title}</h2>

                <div className="profile-row">
                    <button
                        type="button"
                        className="profile-avatar"
                        onClick={() => setPicking(v => !v)}
                        aria-expanded={picking}
                        aria-label="Avatarı değiştir"
                    >
                        <img src={avatarFromSeed(avatar)} alt="" />
                        <span className="profile-avatar-edit">Değiştir</span>
                    </button>
                    <div className="field profile-name">
                        <label className="section-label" htmlFor="profile-name">Masadaki adın</label>
                        <input
                            type="text"
                            id="profile-name"
                            value={name}
                            maxLength={20}
                            autoFocus
                            autoComplete="nickname"
                            onChange={(e) => { setName(e.target.value); setLocalError(''); }}
                            disabled={busy}
                        />
                    </div>
                </div>

                {picking && (
                    <div className="field">
                        <span className="section-label">Avatar seç</span>
                        <div className="avatar-grid" role="radiogroup" aria-label="Avatarlar">
                            {choices.map(seed => (
                                <button
                                    key={seed}
                                    type="button"
                                    role="radio"
                                    aria-checked={seed === avatar}
                                    className={`avatar-choice ${seed === avatar ? 'is-selected' : ''}`}
                                    onClick={() => setAvatar(seed)}
                                >
                                    <img src={avatarFromSeed(seed)} alt="" />
                                </button>
                            ))}
                        </div>
                        <button type="button" className="btn btn-ghost" onClick={() => setChoices([avatar, ...randomSeeds(CHOICES - 1)])}>
                            Başka avatarlar
                        </button>
                    </div>
                )}

                {(localError || error) && <p className="form-error" role="alert">{localError || error}</p>}

                <div className="panel-actions">
                    <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Oturuluyor…' : 'Otur'}</button>
                    <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={busy}>Vazgeç</button>
                </div>
            </form>
        </div>
    );
}

export default ProfileDialog;
