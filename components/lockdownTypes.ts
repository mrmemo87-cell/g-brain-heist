export type PlayerId = string;

export type EntryRoute = {
  id: string;
  label: string;
  description: string;
};

export type RiskRoute = {
  id: string;
  riskLevel: "SAFE" | "RISKY" | "INSANE" | string;
  label: string;
  description: string;
  rewardMultiplier: number;
  heatDelta: number;
};

export type QuestionOption = {
  id: string;
  text: string;
};

export type QuestionState = {
  id: string;
  prompt: string;
  options: QuestionOption[];
  selectedOptionId?: string;
  feedback?: string;
};

export type PlayerStatus = {
  id: PlayerId;
  name: string;
  coins: number;
  heat: number;
  entryRouteId?: string;
  riskRouteId?: string;
  lastAnswerOptionId?: string;
  answered?: boolean;
};

export type PostActionCard = {
  id: string;
  label: string;
  description: string;
  icon?: string;
};

export type RoomSettings = {
  roomCode: string;
  entryRoutes: EntryRoute[];
  riskRoutes: RiskRoute[];
};

export type GamePhase =
  | "join"
  | "chooseRiskRoute"
  | "question"
  | "feedback"
  | "postAction"
  | "waiting";

export type GameState = {
  phase: GamePhase;
  roomSettings: RoomSettings;
  currentQuestion?: QuestionState;
  postActionCards?: PostActionCard[];
  players: Record<PlayerId, PlayerStatus>;
  feedbackMessage?: string;
};

export type GameAction =
  | { type: "ChooseEntryRoute"; playerId: PlayerId; entryRouteId: string }
  | { type: "ChooseRiskRoute"; playerId: PlayerId; riskRouteId: string }
  | { type: "SubmitAnswer"; playerId: PlayerId; questionId: string; optionId: string }
  | { type: "PickPostAction"; playerId: PlayerId; cardId: string };
