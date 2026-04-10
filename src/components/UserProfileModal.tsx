import React, { useEffect, useState } from 'react';

interface ProfileData {
  uid: string;
  email: string;
  fullName?: string;
  displayName?: string;
  bio?: string;
  age?: number;
  location?: string;
  photoURL?: string;
}

interface UserProfileModalProps {
  isOpen: boolean;
  profile: ProfileData | null;
  onClose: () => void;
  onSave: (patch: { displayName: string; bio: string; age: number; location: string }) => void;
}

/* ── Avatar con inicial + gradiente aleatorio pero determinista ── */
const GRADIENTS = [
  'from-indigo-500 to-violet-600',
  'from-sky-500 to-cyan-400',
  'from-emerald-500 to-teal-400',
  'from-rose-500 to-pink-400',
  'from-amber-500 to-orange-400',
  'from-fuchsia-500 to-purple-500',
  'from-lime-500 to-green-400',
  'from-red-500 to-rose-400',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
}

function getInitial(name: string): string {
  return (name || '?')[0].toUpperCase();
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  profile,
  onClose,
  onSave,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [age, setAge] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !profile) return;
    setDisplayName(profile.displayName || profile.fullName || '');
    setBio(profile.bio || '');
    setAge(profile.age ? String(profile.age) : '');
    setLocation(profile.location || '');
    setError('');
  }, [isOpen, profile]);

  if (!isOpen || !profile) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ageValue = Number(age);
    if (!displayName.trim()) {
      setError('El nombre público es obligatorio.');
      return;
    }
    if (!bio.trim()) {
      setError('La bio es obligatoria.');
      return;
    }
    if (!location.trim()) {
      setError('La ubicación es obligatoria.');
      return;
    }
    if (!Number.isFinite(ageValue) || ageValue <= 0) {
      setError('La edad ingresada no es válida.');
      return;
    }

    onSave({ displayName: displayName.trim(), bio: bio.trim(), age: ageValue, location: location.trim() });
  };

  const avatarName = displayName || profile.fullName || profile.email || '?';
  const gradient = getAvatarGradient(avatarName);
  const initial = getInitial(avatarName);

  return (
    <div className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Perfil
            </p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
              Tu información pública
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 flex items-center justify-center"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">

          {/* Avatar generado — inicial con gradiente Dualis */}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-2 ring-white/10`}>
              <span className="text-2xl font-black text-white drop-shadow-sm">{initial}</span>
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">{avatarName}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{profile.email}</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Nombre público
            </label>
            <input
              type="text"
              className="app-input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Bio</label>
            <textarea
              className="app-input min-h-[90px]"
              maxLength={140}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              required
            />
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              Máximo 140 caracteres.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Edad</label>
              <input
                type="number"
                className="app-input"
                min={1}
                max={120}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Ubicación
              </label>
              <input
                type="text"
                className="app-input"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Nombre completo
              </label>
              <input type="text" className="app-input" value={profile.fullName || ''} readOnly />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Email</label>
              <input type="text" className="app-input" value={profile.email || ''} readOnly />
            </div>
          </div>

          {error && (
            <div className="text-xs font-semibold text-rose-600 dark:text-rose-200 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-black uppercase text-slate-500 dark:text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase"
            >
              Guardar perfil
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfileModal;
