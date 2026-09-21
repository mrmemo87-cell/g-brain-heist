import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  BattleQuestion,
  BattleQuestionOption,
  ClanId,
  ClanMetadata,
  ClanTerritoryGameState,
  PlayerStats,
  ZoneId,
} from "../clanTerritoryTypes";
import { NEON_MEGACITY_TERRITORIES } from "../neonMegacityTerritories";
import { getZoneVisual } from "./neonMegacityShader";
import { ClanTerritoryMap } from "./ClanTerritoryMap";

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
}) => {
  const zoneVisuals = useMemo(() => {
    return Object.fromEntries(
      NEON_MEGACITY_TERRITORIES.map((territory) => [
        territory.zoneId,
        getZoneVisual(gameState.zones[territory.zoneId], clans),
      ]),
    ) as Record<ZoneId, ReturnType<typeof getZoneVisual>>;
  }, [gameState.zones, clans]);

  const selectedTerritory = selectedZoneId
    ? NEON_MEGACITY_TERRITORIES.find((territory) => territory.zoneId === selectedZoneId) ?? null
    : null;
  const selectedVisual = selectedZoneId ? zoneVisuals[selectedZoneId] : null;
  const leader = selectedVisual?.entries[0];

  const [feed, setFeed] = useState<string[]>([
    "Shader renderer ready. Click a district.",
  ]);
  const previousZoneRef = useRef<ZoneId | null>(null);
  const previousFeedbackRef = useRef<"correct" | "incorrect" | null>(null);

  const pushFeed = (message: string) => {
    setFeed((current) => [message, ...current].slice(0, 8));
  };

  useEffect(() => {
    if (!selectedZoneId || selectedZoneId === previousZoneRef.current) return;
    previousZoneRef.current = selectedZoneId;
    const territory = NEON_MEGACITY_TERRITORIES.find((item) => item.zoneId === selectedZoneId);
    if (territory) pushFeed(`Target switched to ${territory.name}.`);
  }, [selectedZoneId]);

  useEffect(() => {
    if (!feedback || feedback === previousFeedbackRef.current) return;
    previousFeedbackRef.current = feedback;
    const territoryName = selectedTerritory?.name ?? "the selected district";
    pushFeed(
      feedback === "correct"
        ? `Correct answer. Influence sent to ${territoryName}.`
        : `Incorrect answer. ${territoryName} remains under pressure.`,
    );
  }, [feedback, selectedTerritory?.name]);

  useEffect(() => {
    if (feedback === null) previousFeedbackRef.current = null;
  }, [feedback]);

  const accuracy = player.questionsAnswered > 0
    ? Math.round((player.questionsCorrect / player.questionsAnswered) * 100)
    : 0;

  return (
    <div
      data-v6-student-experience
      className="h-full min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_top,#081524,#02060d_62%,#010308)] text-[#eefbff]"
    >
      <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-cyan-200/15 bg-[#020710]/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black tracking-[0.13em] text-[#eefbff] sm:text-[17px]">
            BRAIN HEIST · NEON MEGACITY · SHADER LAB · V6
          </div>
          <div className="mt-1 text-[11px] text-[#8aa8ba]">
            True clan hue replacement · source artwork provides brightness/texture, not faction color
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black sm:text-[11px]">
          <div className="rounded-[11px] border border-cyan-200/20 bg-[#0b1728] px-3 py-2">
            TIME <span className="ml-1 font-mono text-emerald-300">{formatTimer(gameState.timer)}</span>
          </div>
          <div className="rounded-[11px] border border-cyan-200/20 bg-[#0b1728] px-3 py-2">
            SCORE <span className="ml-1 text-cyan-300">{player.battleScore}</span>
          </div>
          <div className="rounded-[11px] border border-cyan-200/20 bg-[#0b1728] px-3 py-2">
            STREAK <span className="ml-1 text-amber-300">x{player.streak}</span>
          </div>
          <div className="rounded-[11px] border border-cyan-200/20 bg-[#0b1728] px-3 py-2">
            CLAN <span className="ml-1" style={{ color: clans[player.clanId]?.color }}>{player.clanName}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-[14px] p-[14px] xl:grid-cols-[minmax(0,1fr)_315px]">
        <section className="relative min-w-0 overflow-hidden rounded-[18px] border border-cyan-200/20 bg-[#020611] shadow-[0_22px_80px_rgba(0,0,0,.48)]">
          <ClanTerritoryMap
            zones={gameState.zones}
            clans={clans}
            mapId="city"
            selectedZoneId={selectedZoneId}
            onZoneSelect={onSelectZone}
            hideHeader
            hideLegend
            showControls={false}
            containerClassName="!rounded-none !border-0 !shadow-none"
          />
          <div className="pointer-events-none absolute bottom-[15px] left-4 z-[5] hidden rounded-xl border border-cyan-200/15 bg-[#040c18]/70 px-[11px] py-[9px] text-[11px] text-[#b8d4e1] backdrop-blur-[8px] sm:block">
            Click any district. On-map badges show occupation for every active district.
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-3 xl:max-h-[calc(100vh-92px)] xl:overflow-y-auto">
          <section className="rounded-[15px] border border-cyan-200/15 bg-[#040a16]/90 p-[14px]">
            <div className="text-[10px] font-black tracking-[0.18em] text-[#8aa8ba]">SELECTED TERRITORY</div>
            <h2 className="mt-[5px] text-[21px] font-black leading-tight text-[#eefbff]">
              {selectedTerritory?.name ?? "Choose a district"}
            </h2>
            <div className="mt-[3px] text-xs text-[#8aa8ba]">
              {selectedTerritory
                ? `${selectedTerritory.key} · ${selectedTerritory.type}`
                : "Click directly on the city."}
            </div>
            {selectedVisual?.contested && (
              <div className="mt-[10px] rounded-full border border-fuchsia-300/50 bg-gradient-to-r from-cyan-400/15 to-fuchsia-500/15 px-[10px] py-[7px] text-center text-[11px] font-black tracking-[0.11em] text-fuchsia-200 shadow-[0_0_16px_rgba(168,85,247,.15)]">
                ⚠ CONTESTED · LIGHT NETWORK SPLIT
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[11px] border border-slate-400/10 bg-[#0d1729] p-[10px]">
                <span className="text-xs text-[#8aa8ba]">Leader</span>
                <b className="block text-[21px]" style={{ color: leader?.color ?? "#eefbff" }}>
                  {leader?.name ?? "—"}
                </b>
              </div>
              <div className="rounded-[11px] border border-slate-400/10 bg-[#0d1729] p-[10px]">
                <span className="text-xs text-[#8aa8ba]">Occupation</span>
                <b className="block text-[21px]">{Math.round(selectedVisual?.occupation ?? 0)}%</b>
              </div>
            </div>
            <div className="mt-[11px] grid gap-[7px]">
              {Object.values(clans).map((clan) => {
                const entry = selectedVisual?.entries.find((candidate) => candidate.clanId === clan.id);
                const pct = Math.round(entry?.territoryPct ?? 0);
                return (
                  <div key={clan.id} className="grid grid-cols-[64px_1fr_40px] items-center gap-[7px] text-[11px] text-[#bad1de]">
                    <span className="truncate">{clan.name}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-[#0e1a2c]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: clan.color, boxShadow: `0 0 7px ${clan.color}` }}
                      />
                    </div>
                    <b className="text-right text-[#eefbff]">{pct}%</b>
                  </div>
                );
              })}
              {(selectedVisual?.neutralPct ?? 0) > 0 && (
                <div className="grid grid-cols-[64px_1fr_40px] items-center gap-[7px] text-[11px] text-[#bad1de]">
                  <span>Neutral</span>
                  <div className="h-2 overflow-hidden rounded-full bg-[#0e1a2c]">
                    <div className="h-full rounded-full bg-slate-500" style={{ width: `${selectedVisual?.neutralPct ?? 0}%` }} />
                  </div>
                  <b className="text-right text-[#eefbff]">{Math.round(selectedVisual?.neutralPct ?? 0)}%</b>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[15px] border border-cyan-200/15 bg-[#040a16]/90 p-[14px]">
            <div className="text-[10px] font-black tracking-[0.18em] text-[#8aa8ba]">BATTLE QUESTION</div>
            {!selectedZoneId ? (
              <div className="mt-3 rounded-[11px] border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-relaxed text-amber-100">
                Select a district directly on the city first. Every answer reinforces the district currently selected on the map.
              </div>
            ) : currentQuestion ? (
              <div className="mt-3">
                <div className="text-base font-black leading-snug text-[#eefbff]">{currentQuestion.question_text}</div>
                {currentQuestion.image_url && (
                  <img
                    src={currentQuestion.image_url}
                    alt={currentQuestion.image_alt_text || "Question visual"}
                    className="mx-auto mt-3 max-h-36 max-w-full rounded-[10px] border border-slate-700 object-contain"
                  />
                )}
                <div className="mt-3 grid gap-2">
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
                        className={`rounded-[11px] border px-3 py-2.5 text-left text-sm font-bold transition ${
                          showCorrect
                            ? "border-emerald-300/70 bg-emerald-500/25 text-emerald-50"
                            : showWrong
                              ? "border-rose-300/60 bg-rose-500/20 text-rose-50"
                              : "border-cyan-200/20 bg-[#0b1728] text-[#eefbff] hover:border-cyan-300 hover:bg-[#102239]"
                        } disabled:cursor-not-allowed`}
                      >
                        <span>{answerText}</span>
                        {answerImageUrl && (
                          <img
                            src={answerImageUrl}
                            alt={`Option ${index + 1}`}
                            className="mt-2 max-h-20 max-w-full rounded border border-slate-600 object-contain"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-xs text-[#8aa8ba]">Waiting for questions to load…</div>
            )}
          </section>

          <section className="rounded-[15px] border border-cyan-200/15 bg-[#040a16]/90 p-[14px]">
            <div className="text-[10px] font-black tracking-[0.18em] text-[#8aa8ba]">WHAT YOU SHOULD NOTICE</div>
            <div className="mt-2 text-[11px] leading-[1.58] text-[#8aa8ba]">
              Occupation is territory-based. Dynamic lights use true hue replacement: the artwork keeps its brightness and texture, while the clan supplies the final color.
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[#c2d9e5]">
              <span className="h-[13px] w-[13px] shrink-0 rounded-full bg-[#facc15]" />
              Gold appears only as a short scan pulse when you select a district.
            </div>
            <div className="mt-2 flex items-start gap-2 text-[11px] text-[#c2d9e5]">
              <span className="mt-0.5 h-[13px] w-[13px] shrink-0 rounded-full bg-gradient-to-r from-cyan-400 to-purple-500" />
              Influence converts the lighting progressively; contested districts split that network between the top clans.
            </div>
          </section>

          <section className="rounded-[15px] border border-cyan-200/15 bg-[#040a16]/90 p-[14px]">
            <div className="text-[10px] font-black tracking-[0.18em] text-[#8aa8ba]">LIVE OCCUPATION</div>
            <div className="mt-2 grid max-h-[210px] gap-[7px] overflow-y-auto">
              {NEON_MEGACITY_TERRITORIES.map((territory) => {
                const visual = zoneVisuals[territory.zoneId];
                const isSelected = selectedZoneId === territory.zoneId;
                return (
                  <button
                    key={territory.zoneId}
                    type="button"
                    onClick={() => onSelectZone(territory.zoneId)}
                    className="rounded-[10px] border bg-[#0d1729] px-[9px] py-2 text-left"
                    style={{ borderColor: isSelected ? "rgba(250,204,21,.55)" : "rgba(148,163,184,.11)" }}
                  >
                    <div className="mb-[6px] flex items-center justify-between gap-2">
                      <div className="text-[11px] font-extrabold text-[#eefbff]">{territory.id}. {territory.name}</div>
                      <div className="text-[10px] font-extrabold" style={{ color: visual.entries[0]?.color ?? "#94a3b8" }}>
                        {visual.rawTotal > 0 ? `${Math.round(visual.occupation)}% occupied` : "Neutral 100%"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-[6px]">
                      {visual.entries.map((entry) => (
                        <span key={entry.clanId} className="text-[10px] font-extrabold" style={{ color: entry.color }}>
                          {entry.name.slice(0, 1).toUpperCase()} {Math.round(entry.territoryPct)}%
                        </span>
                      ))}
                      {visual.neutralPct > 0 && visual.rawTotal > 0 && (
                        <span className="text-[10px] font-extrabold text-slate-400">Neutral {Math.round(visual.neutralPct)}%</span>
                      )}
                      {visual.rawTotal === 0 && (
                        <span className="text-[10px] font-extrabold text-slate-400">Unoccupied</span>
                      )}
                      {visual.contested && (
                        <span className="text-[10px] font-extrabold text-fuchsia-200">CONTESTED</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[15px] border border-cyan-200/15 bg-[#040a16]/90 p-[14px]">
            <div className="text-[10px] font-black tracking-[0.18em] text-[#8aa8ba]">BATTLE FEED</div>
            <div className="mt-2 grid max-h-[240px] gap-[7px] overflow-y-auto">
              {feed.map((entry, index) => (
                <div key={`${entry}-${index}`} className="rounded-[9px] border border-slate-400/10 bg-[#0d1729] px-[9px] py-2 text-xs">
                  {entry}
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[9px] bg-[#0d1729] p-2">
                <div className="text-[9px] text-[#8aa8ba]">Answered</div>
                <b>{player.questionsAnswered}</b>
              </div>
              <div className="rounded-[9px] bg-[#0d1729] p-2">
                <div className="text-[9px] text-[#8aa8ba]">Accuracy</div>
                <b>{accuracy}%</b>
              </div>
              <div className="rounded-[9px] bg-[#0d1729] p-2">
                <div className="text-[9px] text-[#8aa8ba]">Best streak</div>
                <b>x{player.bestStreak}</b>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
