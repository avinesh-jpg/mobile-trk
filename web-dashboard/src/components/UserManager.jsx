import React, { useState, useEffect } from 'react';
import { api } from '../api';
import {
  Users, UserPlus, Trash2, Shield, User, Mail, Lock,
  CheckCircle, AlertCircle, RefreshCw, Key, Copy, Check
} from 'lucide-react';

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successInfo, setSuccessInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('employee');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Please fill in all fields (Name, Email, Password).');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await api.post('/auth/register', {
        name: name.trim(),
        email: email.trim(),
        password: password.trim(),
        role: role
      });

      setSuccessInfo({
        name: res.data.name,
        email: res.data.email,
        password: password.trim(),
        role: res.data.role
      });

      // Reset form
      setName('');
      setEmail('');
      setPassword('');
      setRole('employee');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create user. Email may already be in use.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    if (userToDelete.role === 'admin') {
      alert("Administrator accounts cannot be deleted directly.");
      return;
    }

    if (window.confirm(`Delete driver/user ${userToDelete.name} (${userToDelete.email})? This will also remove their historical location records.`)) {
      try {
        await api.delete(`/auth/users/${userToDelete.id}`);
        fetchUsers();
      } catch (err) {
        alert(err.response?.data?.detail || 'Failed to delete user.');
      }
    }
  };

  const copyCredentials = () => {
    if (!successInfo) return;
    const text = `CM Vechicle Mobile App Login:\nEmail: ${successInfo.email}\nPassword: ${successInfo.password}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-y-auto bg-slate-950 p-6">
      <div className="max-w-6xl mx-auto w-full space-y-6">

        {/* Top Header Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Driver & Personnel Management</h1>
              <p className="text-xs text-slate-400">
                Register new drivers and field staff for the <span className="text-cyan-400 font-semibold">CM Vechicle</span> mobile app
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchUsers}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Refresh users"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => {
                setShowModal(true);
                setSuccessInfo(null);
                setError('');
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add New Driver / User</span>
            </button>
          </div>
        </div>

        {/* Users Table / List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Registered Accounts ({users.length})
            </div>
            <div className="text-xs text-slate-500">
              Only admins can create or remove field users
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-semibold">ID</th>
                  <th className="py-3 px-4 font-semibold">User Details</th>
                  <th className="py-3 px-4 font-semibold">Email (Login)</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {users.map((u) => {
                  const isAdmin = u.role === 'admin';
                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-500">#{u.id}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                            isAdmin ? 'bg-purple-500/20 text-purple-300' : 'bg-cyan-500/20 text-cyan-300'
                          }`}>
                            {u.name ? u.name.slice(0, 2).toUpperCase() : 'US'}
                          </div>
                          <div>
                            <div className="font-semibold text-white">{u.name}</div>
                            {isAdmin && (
                              <div className="text-[10px] text-purple-400">Dashboard Administrator</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-cyan-300">{u.email}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isAdmin
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        }`}>
                          {isAdmin ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                          {isAdmin ? 'ADMIN' : 'DRIVER / FIELD STAFF'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {!isAdmin ? (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900 rounded-lg transition cursor-pointer"
                            title="Delete driver"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Protected</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {users.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No drivers registered yet. Click <span className="text-cyan-400 font-semibold">+ Add New Driver</span> above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
            
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">Create New Driver / User</h3>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSuccessInfo(null);
                  setError('');
                }}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Success Info Card */}
            {successInfo ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/15 border border-emerald-500/30 rounded-xl p-4 text-emerald-300 text-xs">
                  <div className="flex items-center gap-2 font-bold text-sm mb-1">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>Account Created Successfully!</span>
                  </div>
                  <p className="text-emerald-400/90 text-[11px]">
                    Share these login details with the driver to log in to the <span className="font-bold">CM Vechicle</span> app.
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Driver Name:</span>
                    <span className="font-bold text-white">{successInfo.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Login Email:</span>
                    <span className="font-mono text-cyan-300 font-bold">{successInfo.email}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Password:</span>
                    <span className="font-mono text-emerald-400 font-bold">{successInfo.password}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Role:</span>
                    <span className="uppercase text-purple-300 font-bold">{successInfo.role}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={copyCredentials}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied to Clipboard!' : 'Copy Login Details'}</span>
                  </button>

                  <button
                    onClick={() => setSuccessInfo(null)}
                    className="py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold cursor-pointer transition"
                  >
                    + Add Another
                  </button>
                </div>
              </div>
            ) : (
              /* Creation Form */
              <form onSubmit={handleCreateUser} className="space-y-4">
                {error && (
                  <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-3 text-red-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Email Address (Login Username)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. driver1@company.com"
                      className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. cm123"
                      className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl pl-9 pr-3 py-2.5 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Role & Permissions
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="employee">Field Driver / Employee (Mobile App)</option>
                    <option value="admin">Operations Administrator (Web Dashboard)</option>
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg cursor-pointer transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating Account...' : 'Register Driver'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
