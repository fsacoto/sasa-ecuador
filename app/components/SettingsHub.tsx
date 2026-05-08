'use client';

import { useState } from 'react';
import type { UserRole } from '../services/userRoles';

type SettingsTab = 'profile';

type ProfileFormState = { firstName: string; lastName: string; photoURL: string };

interface SettingsHubProps {
  user: { id: string; email: string; role: UserRole };
  profileForm: ProfileFormState;
  profileSaving: boolean;
  profileError: string;
  onProfileFieldChange: (field: keyof ProfileFormState, value: string) => void;
  onProfileChoosePhoto: () => void;
  onProfileDeletePhoto: () => void;
  onSaveProfile: () => void;
  onResetProfileDraft: () => void;
  onChangePassword: (currentPassword: string, nextPassword: string) => Promise<string | null>;
}

export default function SettingsHub({
  user,
  profileForm,
  profileSaving,
  profileError,
  onProfileFieldChange,
  onProfileChoosePhoto,
  onProfileDeletePhoto,
  onSaveProfile,
  onResetProfileDraft,
  onChangePassword,
}: SettingsHubProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNext, setPasswordNext] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');

  const submitPassword = async () => {
    if (!passwordCurrent || !passwordNext || !passwordConfirm) {
      setPasswordStatus('Please complete all password fields.');
      return;
    }
    if (passwordNext !== passwordConfirm) {
      setPasswordStatus('New password and confirmation do not match.');
      return;
    }
    const err = await onChangePassword(passwordCurrent, passwordNext);
    if (err) {
      setPasswordStatus(err);
      return;
    }
    setPasswordCurrent('');
    setPasswordNext('');
    setPasswordConfirm('');
    setPasswordStatus('Password updated.');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Business Hub operations center configuration</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-gray-200 bg-white p-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              activeTab === 'profile' ? 'bg-[#515151] text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Profile
          </button>
        </aside>

        <section className="rounded-xl border border-gray-200 bg-white p-5">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Profile</h3>
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 overflow-hidden rounded-full border border-gray-300 bg-gray-100">
                  {profileForm.photoURL ? (
                    <img src={profileForm.photoURL} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-gray-500">No photo</div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={onProfileChoosePhoto} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                    Upload / Crop Photo
                  </button>
                  <button type="button" onClick={onProfileDeletePhoto} className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
                    Delete Photo
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-gray-700">First name</label>
                  <input
                    value={profileForm.firstName}
                    onChange={(e) => onProfileFieldChange('firstName', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-700">Last name</label>
                  <input
                    value={profileForm.lastName}
                    onChange={(e) => onProfileFieldChange('lastName', e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-700">Email</label>
                <input value={user.email} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500" />
              </div>
              {profileError && <p className="text-xs text-red-500">{profileError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={onSaveProfile} disabled={profileSaving} className="rounded-md bg-[#515151] px-3 py-1.5 text-xs text-white disabled:opacity-60">
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
                <button type="button" onClick={onResetProfileDraft} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100">
                  Discard changes
                </button>
              </div>

              <div className="mt-6 rounded-lg border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-900">Update Password</h4>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="password"
                    placeholder="Current password"
                    value={passwordCurrent}
                    onChange={(e) => setPasswordCurrent(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    placeholder="New password"
                    value={passwordNext}
                    onChange={(e) => setPasswordNext(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={submitPassword} className="rounded-md bg-[#515151] px-3 py-1.5 text-xs text-white">
                    Update password
                  </button>
                  {passwordStatus && <p className="text-xs text-gray-600">{passwordStatus}</p>}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
