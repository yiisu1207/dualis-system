import React, { useEffect, useRef, useState } from 'react';
import { uploadToCloudinary } from '../utils/cloudinary';
import { Camera, Loader2 } from 'lucide-react';

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
  onSave: (patch: { displayName: string; bio: string; age: number; location: string; photoURL?: string }) => void;
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !profile) return;
    setDisplayName(profile.displayName || profile.fullName || '');
    setBio(profile.bio || '');
    setAge(profile.age ? String(profile.age) : '');
    setLocation(profile.location || '');
    setError('');
    setAvatarPreview(null);
    setAvatarFile(null);
  }, [isOpen, profile]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  if (!isOpen || !profile) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ageValue = Number(age);
    if (!displayName.trim()) {
      setError('El nombre publico es obligatorio.');
      return;
    }
    if (!bio.trim()) {
      setError('La bio es obligatoria.');
      return;
    }
    if (!location.trim()) {
      setError('La ubicacion es obligatoria.');
      return;
    }
    if (!Number.isFinite(ageValue) || ageValue <= 0) {
      setError('La edad ingresada no es valida.');
      return;
    }

    let photoURL: string | undefined;
    if (avatarFile) {
      try {
        setUploadingAvatar(true);
        const result = await uploadToCloudinary(avatarFile, 'dualis_avatars');
        photoURL = result.secure_url;
      } catch {
        setError('Error al subir la imagen. Intenta de nuevo.');
        setUploadingAvatar(false);
        return;
      } finally {
        setUploadingAvatar(false);
      }
    }

    onSave({ displayName: displayName.trim(), bio: bio.trim(), age: ageValue, location: location.trim(), photoURL });
  };

  return (
    <div className="fixed inset-0 z-[220] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Perfil
            </p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">
              Tu informacion publica
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

          {/* Avatar picker */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {avatarPreview || profile?.photoURL ? (
                <img
                  src={avatarPreview ?? profile?.photoURL}
                  alt="Avatar"
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-500/40 shadow-md"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xl font-black shadow-md">
                  {(profile?.displayName || profile?.fullName || '?')[0].toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-colors"
              >
                <Camera size={11} />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-slate-100">Foto de perfil</p>
              <p className="text-[11px] text-slate-400 mt-0.5">JPG, PNG o WEBP · máx 5 MB</p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-1.5 text-[11px] font-black text-indigo-500 hover:text-indigo-600 transition-colors"
              >
                Cambiar foto →
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Nombre publico
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
              Maximo 140 caracteres.
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
                Ubicacion
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
              disabled={uploadingAvatar}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-black uppercase disabled:opacity-60 flex items-center gap-2"
            >
              {uploadingAvatar && <Loader2 size={12} className="animate-spin" />}
              {uploadingAvatar ? 'Subiendo foto...' : 'Guardar perfil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfileModal;
