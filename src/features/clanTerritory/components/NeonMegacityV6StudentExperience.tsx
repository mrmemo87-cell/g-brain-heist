import React from "react";
import type {
  BattleQuestion,
  BattleQuestionOption,
  ClanId,
  ClanMetadata,
  ClanTerritoryGameState,
  PlayerStats,
  ZoneId,
} from "../clanTerritoryTypes";
import { ExactNeonMegacityV6 } from "./ExactNeonMegacityV6";

const getOptionText = (option: string | BattleQuestionOption) =>
  typeof option === "string" ? option : option.text;

const getOptionImageUrl = (option: string | BattleQuestionOption) =>
  typeof option === "string" ? undefined : option.image_url;

const formatTimer = (seconds: number) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
};

type NeonMegacityV6StudentExperienceProps = {
  gameState: ClanTerritoryGameState;
  player: PlayerStats;
  clans: Record<ClanId, ClanMetadata>;
  selectedZoneId: ZoneId | null;
  currentQuestion: BattleQuestion | null;
  shuffledAnswers: (string | BattleQuestionOption)[];
  feedback: "correct" | "incorrect" | null;
  onSelectZone: (zoneId: ZoneId) => void;
  onAnswer: (answer: string) => void;
};

export const NeonMegacityV6StudentExperience: React.FC<NeonMegacityV6StudentExperienceProps> = ({
  gameState,
  player,
  clans,
  selectedZoneId,
  currentQuestion,
  shuffledAnswers,
  feedback,
  onSelectZone,
  onAnswer,
}) => (
  <div data-v6-student-experience className="h-full min-h-0 overflow-y-auto bg-[#02060d] text-[#eefbff]">
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-cyan-200/15 bg-[#020710]/95 px-4 py-2.5 backdrop-blur-xl">
      <div>
        <div className="text-sm font-black tracking-[0.13em]">BRAIN HEIST · NEON MEGACITY · V6</div>
        <div className="mt-0.5 text-[10px] text-[#8aa8ba]">Approved V6 renderer · original shader runtime and native 1672×941 artwork</div>
      </div>
      <div className="flex flex-wrap gap-2 text-[10px] font-black">
        <div className="rounded-lg border border-cyan-200/20 bg-[#0b1728] px-2.5 py-1.5">TIME <span className="font-mono text-emerald-300">{formatTimer(gameState.timer)}</span></div>
        <div className="rounded-lg border border-cyan-200/20 bg-[#0b1728] px-2.5 py-1.5">SCORE <span className="text-cyan-300">{player.battleScore}</span></div>
        <div className="rounded-lg border border-cyan-200/20 bg-[#0b1728] px-2.5 py-1.5">STREAK <span className="text-amber-300">x{player.streak}</span></div>
        <div className="rounded-lg border border-cyan-200/20 bg-[#0b1728] px-2.5 py-1.5">CLAN <span style={{ color: clans[player.clanId]?.color }}>{player.clanName}</span></div>
      </div>
    </div>

    <div className="p-2 sm:p-3">
      <ExactNeonMegacityV6
        zones={gameState.zones}
        clans={clans}
        selectedZoneId={selectedZoneId}
        onZoneSelect={onSelectZone}
        className="!rounded-[14px]"
        title="Brain Heist Neon Megacity V6 battlefield"
      />

      <section className="mx-auto mt-3 max-w-5xl rounded-[15px] border border-cyan-200/15 bg-[#040a16]/95 p-4 shadow-[0_18px_50px_rgba(0,0,0,.35)]">
        <div className="text-[10px] font-black tracking-[0.18em] text-[#8aa8ba]">BATTLE QUESTION</div>
        {!selectedZoneId ? (
          <div className="mt-3 rounded-[11px] border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-100">
            Select a district directly inside the V6 battlefield first.
          </div>
        ) : currentQuestion ? (
          <div className="mt-3">
            <div className="text-lg font-black leading-snug">{currentQuestion.question_text}</div>
            {currentQuestion.image_url && (
              <img
                src={currentQuestion.image_url}
                alt={currentQuestion.image_alt_text || "Question visual"}
                className="mx-auto mt-3 max-h-52 max-w-full rounded-[10px] border border-slate-700 object-contain"
              />
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {shuffledAnswers.map((answer, index) => {
                const answerText = getOptionText(answer);
                const answerImageUrl = getOptionImageUrl(answer);
                const isCorrect = answerText === currentQuestion.correct_answer;
                const showCorrect = feedback !== null && isCorrect;
                const showWrong = feedback === "incorrect" && !isCorrect;
                return (
                  <button
                    key={`${answerText}-${index}`}
                    type="button"
                    disabled={feedback !== null}
                    onClick={() => onAnswer(answerText)}
                    className={`rounded-[11px] border px-3 py-3 text-left text-sm font-bold transition ${
                      showCorrect
                        ? "border-emerald-300/70 bg-emerald-500/25 text-emerald-50"
                        : showWrong
                          ? "border-rose-300/60 bg-rose-500/20 text-rose-50"
                          : "border-cyan-200/20 bg-[#0b1728] text-[#eefbff] hover:border-cyan-300 hover:bg-[#102239]"
                    } disabled:cursor-not-allowed`}
                  >
                    <span>{answerText}</span>
                    {answerImageUrl && (
                      <img src={answerImageUrl} alt={`Option ${index + 1}`} className="mt-2 max-h-24 max-w-full rounded border border-slate-600 object-contain" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-[#8aa8ba]">Waiting for questions to load…</div>
        )}
      </section>
    </div>
  </div>
);
