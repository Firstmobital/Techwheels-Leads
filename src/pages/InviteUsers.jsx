import React, { useState } from 'react';
import { supabaseApi } from '@/api/supabaseService';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Mail, CheckCircle2, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function InviteUsers() {
  const [email, setEmail] = useState('');
  const [caNames, setCaNames] = useState([]);
  const [caInput, setCaInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [invited, setInvited] = useState([]);

  const { data: users = [], refetch } = useQuery({
    queryKey: ['users'],
    queryFn: () => supabaseApi.entities.User.list(),
  });

  const handleAddCaName = () => {
    if (caInput.trim() && !caNames.includes(caInput.trim())) {
      setCaNames(prev => [...prev, caInput.trim()]);
      setCaInput('');
    }
  };

  const handleRemoveCaName = (ca) => {
    setCaNames(prev => prev.filter(c => c !== ca));
  };

  const handleInvite = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      setLoading(true);

      // 1) Invite user
      const inviteRes = await supabaseApi.users.inviteUser(normalizedEmail, 'user');
      if (inviteRes?.error) {
        throw new Error(inviteRes.error.message || 'Failed to invite user');
      }

      const invitedUserId = inviteRes?.data?.user_id;

      // 2) Wait for profiles list refresh
      const refreshed = await refetch();
      const refreshedUsers = refreshed?.data || [];

      // 3) Assign CA names only after profile exists/refetch completes
      if (caNames.length > 0) {
        const invitedUser = invitedUserId
          ? refreshedUsers.find((u) => u.id === invitedUserId)
          : refreshedUsers.find((u) => u.email === normalizedEmail);

        if (!invitedUser) {
          throw new Error('Invited user profile not found after refresh');
        }

        await supabaseApi.entities.User.update(invitedUser.id, { ca_names: caNames });
        await refetch();
      }

      setInvited(prev => [...prev, normalizedEmail]);
      setEmail('');
      setCaNames([]);
      setCaInput('');
      toast.success(`Invitation sent to ${normalizedEmail}`);
    } catch (error) {
      toast.error(error.message || 'Failed to invite user');
    } finally {
      setLoading(false);
    }
  };

  const salespeople = users.filter(u => u.role === 'user');
  const admins = users.filter(u => u.role === 'admin');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-6 pb-4">
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Team Access</h1>
        <p className="text-xs text-gray-400 mt-0.5">Invite salespersons to use Sales Messenger</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Invite Card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <UserPlus className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-800">Invite Salesperson</h2>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="email-input"
                  name="email"
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  className="pl-9 h-10 rounded-xl text-sm border-gray-200"
                />
              </div>
              <Button
                onClick={handleInvite}
                disabled={loading || !email.trim()}
                className="h-10 rounded-xl bg-gray-900 hover:bg-gray-800 px-4 text-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="ca-name-input"
                  name="caName"
                  type="text"
                  placeholder="CA Name (e.g., Rajesh Kumar)"
                  value={caInput}
                  onChange={e => setCaInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCaName()}
                  className="h-10 rounded-xl text-sm border-gray-200 flex-1"
                />
                <Button
                  onClick={handleAddCaName}
                  disabled={!caInput.trim()}
                  variant="outline"
                  className="h-10 rounded-xl text-sm"
                >
                  Add
                </Button>
              </div>
              {caNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {caNames.map(ca => (
                    <div key={ca} className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-xs font-medium flex items-center gap-2">
                      {ca}
                      <button
                        onClick={() => handleRemoveCaName(ca)}
                        className="text-blue-600 hover:text-blue-800 font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            They will receive an email invitation to join the app as a salesperson.
          </p>
        </div>

        {/* This session invites */}
        {invited.length > 0 && (
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h2 className="font-semibold text-sm text-emerald-800">Invitations Sent ({invited.length})</h2>
            </div>
            <div className="space-y-1">
              {invited.map(e => (
                <p key={e} className="text-xs text-emerald-700">✓ {e}</p>
              ))}
            </div>
          </div>
        )}

        {/* Current Users */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-sm text-gray-800">
              Salespersons ({salespeople.length})
            </h2>
          </div>
          {salespeople.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No salespersons invited yet</p>
          ) : (
            <div className="space-y-2">
              {salespeople.map(u => (
               <div key={u.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                 <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                   {u.full_name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase()}
                 </div>
                 <div className="flex-1 min-w-0">
                   <p className="text-sm font-medium text-gray-800 truncate">{u.full_name || '—'}</p>
                   <p className="text-xs text-gray-400 truncate">{u.email}</p>
                   {u.ca_names && u.ca_names.length > 0 && (
                     <p className="text-xs text-gray-500 truncate">CA: {u.ca_names.join(', ')}</p>
                   )}
                 </div>
                  <span className="text-[10px] bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">
                    Sales
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admins */}
        {admins.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gray-500" />
              <h2 className="font-semibold text-sm text-gray-800">Admins ({admins.length})</h2>
            </div>
            <div className="space-y-2">
              {admins.map(u => (
                <div key={u.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-semibold text-amber-700">
                    {u.full_name?.[0]?.toUpperCase() || u.email?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.full_name || '—'}</p>
                    <p className="text-xs text-gray-400 truncate">{u.email}</p>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                    Admin
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}