import React from 'react';
import { QuestIcon, HackIcon, ShopIcon, ClanIcon, InventoryIcon } from './icons';

interface MainActionsProps {
    onStartQuest: () => void;
    onStartPvp: () => void;
    onOpenRaid: () => void;
    onVisitShop: () => void;
    onGoToClan: () => void;
    onVisitInventory: () => void;
    onViewLeaderboard: () => void;
    onViewAchievements: () => void;
    onOpenRaidAdmin?: () => void;
    onOpenTeacherPortal?: () => void;
    onOpenAdminPortal?: () => void;
    onOpenTournament?: () => void;
    onOpenTournamentAdmin?: () => void;
    onOpenCompetitionPlay?: () => void;
    onOpenCompetitionLeaderboard?: () => void;
    onOpenCompetitionAdmin?: () => void;
}

const ActionButton: React.FC<{ icon: React.ReactNode; label: string; color: string; glowClass: string; onClick?: () => void; className?: string; }> = ({ icon, label, color, glowClass, onClick, className }) => {
    const style = {
        backgroundColor: `rgba(${color}, 0.2)`,
        borderColor: `rgba(${color}, 0.8)`,
        color: `rgba(${color}, 1)`,
        textShadow: `0 0 10px rgba(${color}, 0.7)`,
    };
    
    const hoverStyle = {
         backgroundColor: `rgba(${color}, 0.3)`,
         borderColor: `rgba(${color}, 1)`,
    };

    return (
        <button 
            onClick={onClick} 
            className={`action-btn w-full h-full flex flex-col items-center justify-center p-4 md:p-6 rounded-2xl border transition-all duration-300 transform hover:scale-105 active:scale-95 min-h-[100px] md:min-h-[120px] ${glowClass} ${className || ''}`}
            style={style}
            onMouseOver={e => Object.assign(e.currentTarget.style, hoverStyle)}
            onMouseOut={e => Object.assign(e.currentTarget.style, style)}
        >
            <div className="w-10 h-10 md:w-12 md:h-12 mb-2">{icon}</div>
            <span className="font-heading font-bold text-base md:text-lg tracking-wider text-white">{label}</span>
        </button>
    );
};

const MainActions: React.FC<MainActionsProps> = ({ onStartQuest, onStartPvp, onOpenRaid, onVisitShop, onGoToClan, onVisitInventory, onViewLeaderboard, onViewAchievements, onOpenRaidAdmin, onOpenTeacherPortal, onOpenAdminPortal, onOpenTournament, onOpenTournamentAdmin, onOpenCompetitionPlay, onOpenCompetitionLeaderboard, onOpenCompetitionAdmin }) => {
  return (
    <div className="grid grid-cols-2 gap-4 animate-fade-in-up">
        {onOpenCompetitionPlay && (
            <ActionButton
                onClick={onOpenCompetitionPlay}
                icon={<span className="text-3xl">🧠</span>}
                label="Silk Road Play"
                color="0, 255, 200"
                glowClass="glow-success animate-pulse-glow"
                className="col-span-2"
            />
        )}
        {onOpenCompetitionLeaderboard && (
            <ActionButton
                onClick={onOpenCompetitionLeaderboard}
                icon={<span className="text-3xl">📊</span>}
                label="Silk Road Rankings"
                color="0, 160, 255"
                glowClass="glow-ion"
                className={onOpenCompetitionPlay ? 'col-span-2' : ''}
            />
        )}
        <ActionButton
            onClick={onStartQuest}
            icon={<QuestIcon />}
            label="Start Quest"
            color="0, 208, 232" // ion-blue
            glowClass="glow-ion animate-pulse-glow"
        />
        <ActionButton
            onClick={onStartPvp}
            icon={<HackIcon />}
            label="⚔️ Battle"
            color="255, 45, 145" // plasma-pink
            glowClass="glow-plasma animate-pulse-glow"
        />
        <ActionButton
            onClick={onOpenRaid}
            icon={<span className="text-3xl">🐉</span>}
            label="Raids"
            color="72, 61, 139" // deep purple
            glowClass="glow-purple"
        />
        <ActionButton
            onClick={onVisitShop}
            icon={<ShopIcon />}
            label="Visit Shop"
            color="22, 226, 161" // success-teal
            glowClass="glow-success"
        />
        {onOpenTournament && (
            <ActionButton
                onClick={onOpenTournament}
                icon={<span className="text-3xl animate-bounce">🏀</span>}
                label="Tournament"
                color="255, 140, 0"
                glowClass="glow-warn"
            />
        )}
        <ActionButton
            onClick={onGoToClan}
            icon={<ClanIcon />}
            label="Clan"
            color="255, 176, 32" // amber-warn
            glowClass="glow-warn"
        />
        <ActionButton 
            onClick={onVisitInventory}
            icon={<InventoryIcon />} 
            label="Inventory" 
            color="158, 93, 255" // grid-purple
            glowClass="glow-purple"
        />
        <ActionButton 
            onClick={onViewLeaderboard}
            icon={<span className="text-3xl animate-float">🏆</span>} 
            label="Leaderboard" 
            color="255, 215, 0" // gold
            glowClass="glow-warn"
        />
        <ActionButton 
            onClick={onViewAchievements}
            icon={<span className="text-3xl animate-float">🎖️</span>} 
            label="Achievements" 
            color="255, 100, 200" // pink
            glowClass="glow-plasma"
        />
        {onOpenAdminPortal && (
            <ActionButton
                onClick={onOpenAdminPortal}
                icon={<span className="text-4xl animate-spin-slow">👑</span>}
                label="ADMIN"
                color="255, 215, 0" // gold
                glowClass="glow-warn"
                className="animate-pulse-glow col-span-2"
            />
        )}
        {onOpenRaidAdmin && (
            <ActionButton
                onClick={onOpenRaidAdmin}
                icon={<span className="text-3xl">🛡️</span>}
                label="Raid Admin"
                color="0, 191, 255"
                glowClass="glow-ion"
            />
        )}
        {onOpenCompetitionAdmin && (
            <ActionButton
                onClick={onOpenCompetitionAdmin}
                icon={<span className="text-3xl">🛰️</span>}
                label="Silk Road Admin"
                color="0, 191, 255"
                glowClass="glow-ion"
                className="col-span-2"
            />
        )}
        {onOpenTournamentAdmin && (
            <ActionButton
                onClick={onOpenTournamentAdmin}
                icon={<span className="text-3xl animate-float">📊</span>}
                label="Tournament Ops"
                color="135, 206, 250"
                glowClass="glow-ion"
                className="col-span-2"
            />
        )}
        {onOpenTeacherPortal && (
            <ActionButton
                onClick={onOpenTeacherPortal}
                icon={<span className="text-3xl animate-bounce">👨‍🏫</span>}
                label="Teacher" 
                color="100, 200, 255" // light blue
                glowClass="glow-ion"
            />
        )}
    </div>
  );
};

export default MainActions;