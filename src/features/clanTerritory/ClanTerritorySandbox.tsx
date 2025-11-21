import React, { useReducer, useEffect, useState } from "react";
import {
  clanTerritoryReducer,
  INITIAL_STATE,
} from "./clanTerritoryEngine";
import { ClanTerritoryTeacherView } from "./components/ClanTerritoryTeacherView";
import { ClanTerritoryStudentView } from "./components/ClanTerritoryStudentView";
import { ZoneId } from "./clanTerritoryTypes";

interface ClanTerritorySandboxProps {
  onExit: () => void;
}

export const ClanTerritorySandbox: React.FC<ClanTerritorySandboxProps> = ({ onExit }) => {
  const [state, dispatch] = useReducer(clanTerritoryReducer, INITIAL_STATE);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  // Simulate Game Loop (Timer)
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "TICK" });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-join some test players
  useEffect(() => {
    const testPlayers = [
      { id: "p1", name: "Alice", clanId: "clan-a", clanName: "Alpha Wolves" },
      { id: "p2", name: "Bob", clanId: "clan-b", clanName: "Binary Blades" },
      { id: "p3", name: "Charlie", clanId: "clan-c", clanName: "Cipher Squad" },
      { id: "p4", name: "Dave", clanId: "clan-d", clanName: "Delta Phantoms" },
    ] as const;

    testPlayers.forEach((p) => {
      dispatch({
        type: "JOIN",
        payload: { player: { id: p.id, name: p.name, clanId: p.clanId, clanName: p.clanName } },
      });
    });
    setActivePlayerId("p1");
  }, []);

  const handleStartGame = (duration: number) => {
    dispatch({ type: "START_GAME", payload: { duration } });
  };

  const handleEndGame = () => {
    dispatch({ type: "END_GAME" });
  };

  const handleSelectZone = (playerId: string, zoneId: ZoneId) => {
    dispatch({ type: "SELECT_ZONE", payload: { playerId, zoneId } });
  };

  const handleSubmitAnswer = (playerId: string, isCorrect: boolean, durationMs: number = 1000) => {
    dispatch({ type: "SUBMIT_ANSWER", payload: { playerId, isCorrect, durationMs } });
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white overflow-hidden">
      <div className="bg-gray-900 p-2 flex justify-between items-center text-xs text-gray-500 border-b border-gray-800">
        <span>CLAN TERRITORY SANDBOX MODE</span>
        <button onClick={onExit} className="text-red-500 hover:text-red-400 font-bold">EXIT</button>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Teacher View (Projector) */}
        <div className="w-2/3 border-r border-gray-800 flex flex-col">
          <div className="bg-gray-800 px-4 py-2 text-sm font-bold text-gray-400">
            PROJECTOR VIEW
          </div>
          <div className="flex-1 overflow-auto relative">
            <ClanTerritoryTeacherView
              gameState={state}
              selectedQuestions={[]}
              onStartGame={handleStartGame}
              onEndGame={handleEndGame}
              onKickPlayer={() => {}}
            />
          </div>
        </div>

        {/* Student View (Mobile) */}
        <div className="w-1/3 flex flex-col bg-gray-950">
          <div className="bg-gray-800 px-4 py-2 text-sm font-bold text-gray-400 flex justify-between items-center">
            <span>PLAYER VIEW</span>
            <select
              className="bg-gray-900 text-white text-xs p-1 rounded"
              value={activePlayerId || ""}
              onChange={(e) => setActivePlayerId(e.target.value)}
            >
              {Object.values(state.players).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({state.clans[p.clanId]?.name ?? "Unknown Clan"})
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 overflow-hidden relative border-8 border-gray-900 rounded-3xl m-4 shadow-2xl bg-black">
            {activePlayerId && state.players[activePlayerId] ? (
              <ClanTerritoryStudentView
                gameState={state}
                playerId={activePlayerId}
                onSelectZone={(zoneId) => zoneId && handleSelectZone(activePlayerId, zoneId)}
                onSubmitAnswer={(isCorrect, durationMs) => handleSubmitAnswer(activePlayerId, isCorrect, durationMs)}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a player
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
