import React, { useEffect, useState } from 'react';
import * as AuthService from '../services/authService';

interface JoinSchoolModalProps {
    isOpen: boolean;
    onClose: () => void;
    role: 'student' | 'teacher';
    onJoined: () => Promise<void> | void;
}

const JoinSchoolModal: React.FC<JoinSchoolModalProps> = ({ isOpen, onClose, role, onJoined }) => {
    const [inviteCode, setInviteCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const normalizeInviteCode = (code: string) => code.replace(/\s+/g, '').toUpperCase();
    const inviteCodeNormalized = normalizeInviteCode(inviteCode);
    const inviteCodeReady = inviteCodeNormalized.length >= 10;

    useEffect(() => {
        if (!isOpen) {
            setInviteCode('');
            setError(null);
            setIsLoading(false);
        }
    }, [isOpen]);

    const handleJoin = async () => {
        if (!inviteCodeReady) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await AuthService.joinSchoolByCode(inviteCodeNormalized, role);
            if (!result.success) {
                setError('Invalid invite code');
                return;
            }
            await onJoined();
            onClose();
        } catch (err) {
            setError('Invalid invite code');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl shadow-cyan-500/10">
                <div className="text-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Join a school</h2>
                    <p className="text-sm text-gray-400">Enter your invite code to join.</p>
                </div>

                {error && (
                    <div className="mb-4 rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200 text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-3">
                    <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => {
                            setInviteCode(normalizeInviteCode(e.target.value));
                            setError(null);
                        }}
                        placeholder="AFIZV8NTLW"
                        maxLength={10}
                        className="w-full rounded-md border border-gray-600 bg-gray-800 p-3 text-center text-white uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    />
                    <p className="text-xs text-gray-400 text-center">Invite codes are 10 characters.</p>
                </div>

                <div className="mt-6 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-md border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-200 hover:border-gray-400"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleJoin}
                        disabled={isLoading || !inviteCodeReady}
                        className="flex-1 rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isLoading ? 'Joining...' : 'Join'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default JoinSchoolModal;
