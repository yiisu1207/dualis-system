import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getSentRequests,
  getReceivedRequests,
  listUsers,
  searchUsers,
  acceptRequest,
  rejectRequest,
  updateUser,
  deleteUser,
  sendWorkspaceRequest,
} from '../firebase/api';

export default function Configuracion() {
  const [activeTab, setActiveTab] = useState('usuarios');
  const { userProfile } = useAuth();

  // Requests sent / received
  const [sent, setSent] = useState<any[]>([]);
  const [received, setReceived] = useState<any[]>([]);

  // Users
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    // load sent requests
    (async () => {
      try {
        setLoading(true);
        const s = await getSentRequests(userProfile.uid);
        setSent(s as any[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        setLoading(true);
        const r = await getReceivedRequests(userProfile.businessId);
        setReceived(r as any[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        setLoading(true);
        const list = await listUsers(userProfile.businessId);
        setUsers(list as any[]);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [userProfile]);

  const handleSearch = async () => {
    if (!userProfile) return;
    setLoading(true);
    try {
      if (!search) {
        const list = await listUsers(userProfile.businessId);
        setUsers(list as any[]);
      } else {
        const res = await searchUsers(userProfile.businessId, search);
        setUsers(res as any[]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (id: string) => {
    setLoading(true);
    try {
      await acceptRequest(id);
      setReceived((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    setLoading(true);
    try {
      await rejectRequest(id);
      setReceived((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRole = async (uid: string, role: string) => {
    setLoading(true);
    try {
      await updateUser(uid, { role });
      setUsers((u) => u.map((x) => (x.id === uid ? { ...x, role } : x)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm('¿Eliminar usuario? Esta acción no se puede deshacer.')) return;
    setLoading(true);
    try {
      await deleteUser(uid);
      setUsers((u) => u.filter((x) => x.id !== uid));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl font-black mb-6">Configuración</h2>
        <p className="text-slate-600 mb-6">Ajustes del sistema, usuarios y permisos.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">General</h4>
            <p className="text-sm text-slate-600 mt-2">Preferencias de la empresa, moneda y zona horaria.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl border shadow-sm">
            <h4 className="font-bold">Usuarios</h4>
            <p className="text-sm text-slate-600 mt-2">Gestiona roles, accesos y permisos.</p>
          </div>
        </div>

        <div className="mt-10">
          <h3 className="text-2xl font-bold mb-4">Gestión de Usuarios</h3>
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setActiveTab('solicitudes-enviadas')}
              className={`px-4 py-2 rounded-lg ${activeTab === 'solicitudes-enviadas' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}
            >
              Solicitudes Enviadas
            </button>
            <button
              onClick={() => setActiveTab('solicitudes-recibidas')}
              className={`px-4 py-2 rounded-lg ${activeTab === 'solicitudes-recibidas' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}
            >
              Solicitudes Recibidas
            </button>
            <button
              onClick={() => setActiveTab('lista-usuarios')}
              className={`px-4 py-2 rounded-lg ${activeTab === 'lista-usuarios' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}
            >
              Lista de Usuarios
            </button>
          </div>

          {activeTab === 'solicitudes-enviadas' && (
            <div>
              <h4 className="font-semibold mb-3">Solicitudes Enviadas</h4>
              <div className="mb-4 p-4 border rounded-lg bg-slate-50">
                <p className="text-sm text-slate-600 mb-2">Enviar nueva solicitud para unirse a un Espacio de Trabajo</p>
                <div className="flex gap-2">
                  <input value={newWorkspaceId} onChange={(e) => setNewWorkspaceId(e.target.value)} placeholder="Código del espacio (ej. biz_123456)" className="flex-1 px-3 py-2 border rounded-md" />
                  <button onClick={async () => {
                    if (!userProfile) return alert('No autenticado');
                    if (!newWorkspaceId) return alert('Introduce el código del espacio');
                    setLoading(true);
                    try {
                      await sendWorkspaceRequest({ senderId: userProfile.uid, senderEmail: userProfile.email, senderName: userProfile.fullName, workspaceId: newWorkspaceId });
                      alert('Solicitud enviada.');
                      const s = await getSentRequests(userProfile.uid);
                      setSent(s as any[]);
                      setNewWorkspaceId('');
                    } catch (e) {
                      console.error(e);
                      alert('Error enviando solicitud.');
                    } finally { setLoading(false); }
                  }} className="px-4 py-2 bg-indigo-600 text-white rounded-md">Enviar</button>
                </div>
              </div>
              {loading ? (
                <p>Cargando...</p>
              ) : sent.length === 0 ? (
                <p className="text-sm text-slate-500">No tienes solicitudes enviadas.</p>
              ) : (
                <ul className="space-y-3">
                  {sent.map((s) => (
                    <li key={s.id} className="p-3 border rounded-lg flex justify-between items-center">
                      <div>
                        <div className="font-medium">{s.senderEmail}</div>
                        <div className="text-sm text-slate-500">Estado: {s.status}</div>
                      </div>
                      <div className="text-sm text-slate-400">{new Date(s.createdAt).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'solicitudes-recibidas' && (
            <div>
              <h4 className="font-semibold mb-3">Solicitudes Recibidas</h4>
              {loading ? (
                <p>Cargando...</p>
              ) : received.length === 0 ? (
                <p className="text-sm text-slate-500">No hay solicitudes pendientes.</p>
              ) : (
                <ul className="space-y-3">
                  {received.map((r) => (
                    <li key={r.id} className="p-3 border rounded-lg flex justify-between items-center">
                      <div>
                        <div className="font-medium">{r.senderName || r.senderEmail}</div>
                        <div className="text-sm text-slate-500">Email: {r.senderEmail}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleAccept(r.id)} className="px-3 py-1 bg-green-500 text-white rounded-md">Aceptar</button>
                        <button onClick={() => handleReject(r.id)} className="px-3 py-1 bg-red-500 text-white rounded-md">Rechazar</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'lista-usuarios' && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o correo" className="px-3 py-2 border rounded-md w-full" />
                <button onClick={handleSearch} className="px-4 py-2 bg-indigo-600 text-white rounded-md">Buscar</button>
              </div>

              {loading ? (
                <p>Cargando usuarios...</p>
              ) : users.length === 0 ? (
                <p className="text-sm text-slate-500">No hay usuarios registrados en este espacio.</p>
              ) : (
                <div className="space-y-3">
                  {users.map((u) => (
                    <div key={u.uid || u.id} className="p-3 border rounded-lg flex items-center justify-between">
                      <div>
                        <div className="font-medium">{u.fullName || u.email}</div>
                        <div className="text-sm text-slate-500">{u.email}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={u.role} onChange={(e) => handleUpdateRole(u.uid || u.id, e.target.value)} className="px-2 py-1 border rounded-md">
                          <option value="admin">admin</option>
                          <option value="staff">staff</option>
                          <option value="member">member</option>
                        </select>
                        <button onClick={() => handleDeleteUser(u.uid || u.id)} className="px-3 py-1 bg-red-500 text-white rounded-md">Eliminar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
