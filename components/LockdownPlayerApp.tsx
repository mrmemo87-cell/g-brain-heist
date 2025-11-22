import React from "react";
import {
  EntryRoute,
  GameAction,
  GameState,
  PlayerId,
  PostActionCard,
  QuestionOption,
  QuestionState,
  RiskRoute,
} from "./lockdownTypes";

type PlayerAppProps = {
  gameState: GameState;
  selfPlayerId: PlayerId;
  onAction: (action: GameAction) => void;
};

export const PlayerApp: React.FC<PlayerAppProps> = ({
  gameState,
  selfPlayerId,
  onAction,
}) => {
  const selfPlayer = gameState.players[selfPlayerId];

  if (!selfPlayer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">You are not part of this room yet.</p>
          <p className="text-sm text-slate-300">Wait for the host to add you or retry joining.</p>
        </div>
      </div>
    );
  }

  const handleEntryRoute = (entryRouteId: string) =>
    onAction({
      type: "ChooseEntryRoute",
      playerId: selfPlayerId,
      entryRouteId,
    });

  const handleRiskRoute = (riskRouteId: string) =>
    onAction({
      type: "ChooseRiskRoute",
      playerId: selfPlayerId,
      riskRouteId,
    });

  const handleSubmitAnswer = (questionId: string, optionId: string) =>
    onAction({
      type: "SubmitAnswer",
      playerId: selfPlayerId,
      questionId,
      optionId,
    });

  const handlePickCard = (cardId: string) =>
    onAction({
      type: "PickPostAction",
      playerId: selfPlayerId,
      cardId,
    });

  const showHud = gameState.phase !== "join";
  const feedback = gameState.feedbackMessage || gameState.currentQuestion?.feedback;
  const riskRoutes = gameState.roomSettings?.riskRoutes || [];
  const needsRiskSelection =
    (gameState.phase === "chooseRiskRoute" || !selfPlayer.riskRouteId) && riskRoutes.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="p-4 flex items-center justify-between bg-slate-900 shadow">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Room Code</p>
          <p className="text-2xl font-extrabold tracking-tight">{gameState.roomSettings.roomCode}</p>
        </div>
        {showHud && (
          <HeatAndCoinsHud heat={selfPlayer.heat} coins={selfPlayer.coins} />
        )}
      </header>

      <main className="flex-1 p-4 space-y-4">
        {gameState.phase === "join" && (
          <JoinScreen
            roomCode={gameState.roomSettings.roomCode}
            entryRoutes={gameState.roomSettings.entryRoutes}
            selectedEntryRouteId={selfPlayer.entryRouteId}
            onChooseEntryRoute={handleEntryRoute}
          />
        )}

        {gameState.phase !== "join" && (
          <div className="space-y-4">
            {needsRiskSelection && (
              <RiskRouteSelector
                riskRoutes={riskRoutes}
                selectedRiskRouteId={selfPlayer.riskRouteId}
                onSelect={handleRiskRoute}
              />
            )}

            {gameState.currentQuestion && (
              <QuestionView
                question={gameState.currentQuestion}
                disabled={gameState.phase !== "question"}
                onAnswer={(optionId) => handleSubmitAnswer(gameState.currentQuestion!.id, optionId)}
              />
            )}

            {feedback && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-200">
                {feedback}
              </div>
            )}

            {gameState.phase === "postAction" && gameState.postActionCards && (
              <PostActionCards cards={gameState.postActionCards} onSelect={handlePickCard} />
            )}
          </div>
        )}
      </main>
    </div>
  );
};

type JoinScreenProps = {
  roomCode: string;
  entryRoutes: EntryRoute[];
  selectedEntryRouteId?: string;
  onChooseEntryRoute: (entryRouteId: string) => void;
};

export const JoinScreen: React.FC<JoinScreenProps> = ({
  roomCode,
  entryRoutes,
  selectedEntryRouteId,
  onChooseEntryRoute,
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Lockdown Countdown</h1>
        <p className="text-sm text-slate-300">Enter the room and choose your infiltration route.</p>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 border border-slate-800">
          <span className="text-xs uppercase tracking-widest text-slate-400">Room</span>
          <span className="text-lg font-mono font-semibold">{roomCode}</span>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm text-slate-400">Pick your entry route</p>
        <EntryRoutePicker
          routes={entryRoutes}
          selectedRouteId={selectedEntryRouteId}
          onSelect={onChooseEntryRoute}
        />
      </div>
    </div>
  );
};

type EntryRoutePickerProps = {
  routes: EntryRoute[];
  selectedRouteId?: string;
  onSelect: (entryRouteId: string) => void;
};

export const EntryRoutePicker: React.FC<EntryRoutePickerProps> = ({
  routes,
  selectedRouteId,
  onSelect,
}) => {
  if (!routes?.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-slate-300">
        Waiting for the host to configure entry routes.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {routes.map((route) => {
        const isSelected = route.id === selectedRouteId;
        return (
          <button
            key={route.id}
            onClick={() => onSelect(route.id)}
            className={`w-full rounded-xl border p-4 text-left transition shadow-sm hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950 ${
              isSelected
                ? "border-emerald-400/80 bg-emerald-500/10"
                : "border-slate-800 bg-slate-900/60 hover:border-emerald-400/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">{route.label}</div>
              {isSelected && (
                <span className="text-xs uppercase tracking-wide text-emerald-300">Selected</span>
              )}
            </div>
            <p className="mt-2 text-sm text-slate-300">{route.description}</p>
          </button>
        );
      })}
    </div>
  );
};

type RiskRouteSelectorProps = {
  riskRoutes: RiskRoute[];
  selectedRiskRouteId?: string;
  onSelect: (riskRouteId: string) => void;
};

export const RiskRouteSelector: React.FC<RiskRouteSelectorProps> = ({
  riskRoutes,
  selectedRiskRouteId,
  onSelect,
}) => {
  if (!riskRoutes?.length) {
    return null;
  }

  const riskOrder = ["SAFE", "RISKY", "INSANE"];
  const sortedRoutes = [...riskRoutes].sort(
    (a, b) => riskOrder.indexOf(a.riskLevel) - riskOrder.indexOf(b.riskLevel)
  );

  const accentStyles: Record<
    string,
    {
      selected: string;
      unselected: string;
      badge: string;
      badgeText: string;
      ring: string;
      selectedText: string;
    }
  > = {
    SAFE: {
      selected: "border-emerald-400/80 bg-emerald-500/10",
      unselected: "border-slate-800 bg-slate-900/60 hover:border-slate-700",
      badge: "bg-emerald-500/10 border border-emerald-500/30",
      badgeText: "text-emerald-300",
      ring: "focus:ring-emerald-400",
      selectedText: "text-emerald-200",
    },
    RISKY: {
      selected: "border-amber-400/80 bg-amber-500/10",
      unselected: "border-slate-800 bg-slate-900/60 hover:border-slate-700",
      badge: "bg-amber-500/10 border border-amber-500/30",
      badgeText: "text-amber-300",
      ring: "focus:ring-amber-400",
      selectedText: "text-amber-200",
    },
    INSANE: {
      selected: "border-rose-400/80 bg-rose-500/10",
      unselected: "border-slate-800 bg-slate-900/60 hover:border-slate-700",
      badge: "bg-rose-500/10 border border-rose-500/30",
      badgeText: "text-rose-300",
      ring: "focus:ring-rose-400",
      selectedText: "text-rose-200",
    },
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-300">Choose your risk route</p>
        <span className="text-xs text-slate-400">Safe vs. Reward tradeoff</span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {sortedRoutes.map((route) => {
          const isSelected = route.id === selectedRiskRouteId;
          const palette = accentStyles[route.riskLevel] || {
            selected: "border-sky-400/80 bg-sky-500/10",
            unselected: "border-slate-800 bg-slate-900/60 hover:border-slate-700",
            badge: "bg-sky-500/10 border border-sky-500/30",
            badgeText: "text-sky-300",
            ring: "focus:ring-sky-400",
            selectedText: "text-sky-200",
          };
          return (
            <button
              key={route.id}
              onClick={() => onSelect(route.id)}
              className={`w-full rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 ${palette.ring} ${
                isSelected ? palette.selected : palette.unselected
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-full ${palette.badge} ${palette.badgeText}`}
                  >
                    {route.riskLevel}
                  </span>
                  <span className="text-lg font-semibold">{route.label}</span>
                </div>
                {isSelected && (
                  <span className={`text-xs uppercase tracking-wide ${palette.selectedText}`}>
                    Selected
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-300">{route.description}</p>
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                <span>Reward x{route.rewardMultiplier.toFixed(1)}</span>
                <span className="h-1 w-1 rounded-full bg-slate-600" aria-hidden />
                <span>Heat {route.heatDelta >= 0 ? "+" : ""}{route.heatDelta}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

type QuestionViewProps = {
  question: QuestionState;
  disabled?: boolean;
  onAnswer: (optionId: string) => void;
};

export const QuestionView: React.FC<QuestionViewProps> = ({ question, disabled, onAnswer }) => {
  // Memoize options to prevent re-shuffling on each render
  const stableOptions = React.useMemo(() => question.options, [question.id]);
  
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">Question</p>
        <p className="text-lg font-semibold leading-snug">{question.prompt}</p>
      </div>
      <AnswerOptions
        options={stableOptions}
        selectedOptionId={question.selectedOptionId}
        disabled={disabled || !!question.selectedOptionId}
        onSelect={onAnswer}
      />
    </div>
  );
};

type AnswerOptionsProps = {
  options: QuestionOption[];
  selectedOptionId?: string;
  disabled?: boolean;
  onSelect: (optionId: string) => void;
};

export const AnswerOptions: React.FC<AnswerOptionsProps> = ({
  options,
  selectedOptionId,
  disabled,
  onSelect,
}) => {
  // Memoize the stable option list to prevent re-renders from shuffling
  const stableOptions = React.useMemo(() => options, [options.length, options[0]?.id]);
  
  return (
    <div className="grid grid-cols-1 gap-3">
      {stableOptions.map((option, index) => {
        const isSelected = option.id === selectedOptionId;
        return (
          <button
            key={option.id}
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            className={`w-full rounded-xl border p-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950 ${
              isSelected
                ? "border-emerald-400/80 bg-emerald-500/10"
                : "border-slate-800 bg-slate-900/60 hover:border-emerald-400/60"
            } ${disabled ? "opacity-70 cursor-not-allowed" : "hover:-translate-y-0.5"}`}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">{String.fromCharCode(65 + index)}</span>
              <span className="text-sm text-slate-100">{option.text}</span>
            </div>
            {isSelected && <p className="mt-2 text-xs text-emerald-200">Submitted</p>}
          </button>
        );
      })}
    </div>
  );
};

type PostActionCardsProps = {
  cards: PostActionCard[];
  onSelect: (cardId: string) => void;
};

export const PostActionCards: React.FC<PostActionCardsProps> = ({ cards, onSelect }) => {
  if (!cards?.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-slate-300">
        Waiting for next action...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-300">Pick your move</p>
      <div className="grid grid-cols-1 gap-3">
        {cards.map((card) => (
          <button
            key={card.id}
            onClick={() => onSelect(card.id)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-400/60 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            <div className="flex items-center gap-3">
              {card.icon && (
                <span className="text-xl" role="img" aria-hidden>
                  {card.icon}
                </span>
              )}
              <div>
                <p className="text-base font-semibold text-slate-100">{card.label}</p>
                <p className="text-sm text-slate-300">{card.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

type HeatAndCoinsHudProps = {
  heat: number;
  coins: number;
};

export const HeatAndCoinsHud: React.FC<HeatAndCoinsHudProps> = ({ heat, coins }) => {
  return (
    <div className="flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900/80 px-4 py-2 text-sm shadow-sm">
      <div className="flex items-center gap-1">
        <span className="text-xs uppercase text-slate-400">Heat</span>
        <span className="font-semibold text-amber-300">{heat}</span>
      </div>
      <span className="h-4 w-px bg-slate-800" aria-hidden />
      <div className="flex items-center gap-1">
        <span className="text-xs uppercase text-slate-400">Coins</span>
        <span className="font-semibold text-emerald-300">{coins}</span>
      </div>
    </div>
  );
};

export default PlayerApp;
