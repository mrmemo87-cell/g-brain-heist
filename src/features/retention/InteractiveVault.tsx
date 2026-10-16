import React, { useState } from 'react';
import { VaultArtwork } from './RetentionArtwork';
import { playRetentionSound } from './retentionSound';
export default function InteractiveVault({ userId, unlocked }: { userId: string; unlocked: boolean }) {
  const [open, setOpen] = useState(false);
  return <div className="retention-interactive-vault"><VaultArtwork open={open && unlocked}/><button type="button" disabled={!unlocked} aria-expanded={open && unlocked} onClick={() => {
    const next = !open; setOpen(next); playRetentionSound(userId, next ? 'unlock' : 'tap');
  }}>{unlocked ? open ? 'Close the vault' : 'Open our vault ✦' : 'Complete the class goal to unlock'}</button><span className="retention-vault-message" role="status">{open && unlocked ? 'Teamwork unlocked it. Everyone contributed.' : ''}</span></div>;
}
