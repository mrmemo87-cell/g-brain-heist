import React from 'react';
import { QuestIcon, HackIcon, ShopIcon, ClanIcon, InventoryIcon } from './icons';

interface MainActionsProps {
    onStartQuest: () => void;
    onStartPvp: () => void;
    onVisitShop: () => void;
    onGoToClan: () => void;
    onVisitInventory: () => void;
    onViewLeaderboard: () => void;
    onViewAchievements: () => void;
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

const MainActions: React.FC<MainActionsProps> = ({ onStartQuest, onStartPvp, onVisitShop, onGoToClan, onVisitInventory, onViewLeaderboard, onViewAchievements }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
        <ActionButton 
            onClick={onStartQuest}
            icon={<QuestIcon />} 
            label="Start Quest" 
            color="0, 208, 232" // ion-blue
            glowClass="glow-ion"
        />
        <ActionButton 
            onClick={onStartPvp}
            icon={<HackIcon />} 
            label="Hack Rival" 
            color="255, 45, 145" // plasma-pink
            glowClass="glow-plasma"
        />
        <ActionButton 
            onClick={onVisitShop}
            icon={<ShopIcon />} 
            label="Visit Shop" 
            color="22, 226, 161" // success-teal
            glowClass="glow-success"
        />
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
            icon={<span className="text-3xl">🏆</span>} 
            label="Leaderboard" 
            color="255, 215, 0" // gold
            glowClass="glow-warn"
        />
        <ActionButton 
            onClick={onViewAchievements}
            icon={<span className="text-3xl">🎖️</span>} 
            label="Achievements" 
            color="255, 100, 200" // pink
            glowClass="glow-plasma"
        />
    </div>
  );
};

export default MainActions;