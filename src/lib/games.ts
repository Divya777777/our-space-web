// Play tab: types, the server API, and a sample version for the demo space (Leo plays along).
export type Stroke = { id: string; c: string; s: number; p: [number, number][] };
export type ScribbleView = {
  version: number; drawer: string; drawerName: string; round: number; rounds: number; phase: 'drawing' | 'guessing' | 'solved' | 'timeup' | 'over';
  word: string | null; length: number; msLeft: number; strokes: Stroke[]; guesses: { by: string; name: string; text: string; ok: boolean }[]; pts: Record<string, number>; solvedBy: string | null;
};
export type Turn = { id: string; from: string; fromName: string; at: number; strokes: Stroke[]; length: number; hints: number; tries: string[]; solved: boolean; word: string; expired?: boolean; msLeft?: number; started?: boolean };
export type TdView = { version: number; decks: { sweet: boolean; fun: boolean; spicy: boolean }; spicyAsked: string[]; spicyOn: boolean; turn: string; turnName: string; card: { kind: 'truth' | 'dare'; deck: string; text: string } | null; swaps: Record<string, number>; need: number };
export type QuizQuestion = { id?: number; q: string; you?: string; opts: string[] };
export type QuizState = { questions: QuizQuestion[]; ids?: number[]; answered: boolean; myAnswers: number[] | null; people: { id: string; name: string; ready: boolean; guessed: boolean; score: number | null; answers: number[] | null; guesses: number[] | null; questions?: QuizQuestion[] | null }[] };
export type Hub = { month: string; partner: { id: string; name: string } | null; scores: { id: string; name: string; points: number }[]; live: { scribble: { drawer: string; drawerName: string; phase: string } | null; td: { turnName: string } | null }; turns: { id: string; fromName: string; at: number }[]; quiz: { ready: { id: string; name: string }[]; answered: boolean } };

export type GamesApi = {
  hub(): Promise<Hub>;
  scribble(): Promise<ScribbleView | null>;
  scribbleAction(body: Record<string, unknown>): Promise<ScribbleView | null>;
  sendTurn(): Promise<void>;
  /** A word to draw (pass the current one to get a different word). */
  drawWord(skip?: string): Promise<string>;
  /** Draw-and-send Scribble: the whole drawing and its word go at once; they guess later. */
  sendDrawing(word: string, strokes: Stroke[]): Promise<void>;
  turns(): Promise<Turn[]>;
  turnAction(id: string, body: Record<string, unknown>): Promise<{ turn: Turn; solved: boolean; expired?: boolean }>;
  truthDare(): Promise<TdView | null>;
  tdAction(body: Record<string, unknown>): Promise<TdView | null>;
  quiz(): Promise<QuizState>;
  quizAnswer(answers: number[], ids?: number[]): Promise<QuizState>;
  quizGuess(about: string, guesses: number[]): Promise<{ score: number; answers: number[] }>;
};
type Api = <T>(path: string, body?: unknown, method?: string) => Promise<T>;
export function liveGames(api: Api, code: string): GamesApi {
  const r = `/rooms/${code}`;
  return {
    hub: () => api<Hub>(`${r}/play`),
    scribble: async () => (await api<{ view: ScribbleView | null }>(`${r}/scribble`)).view,
    scribbleAction: async body => (await api<{ view: ScribbleView | null }>(`${r}/scribble`, body, 'POST')).view,
    sendTurn: async () => { await api(`${r}/scribble/turn`, {}, 'POST'); },
    drawWord: async skip => (await api<{ word: string }>(`${r}/scribble/word${skip ? `?skip=${encodeURIComponent(skip)}` : ''}`)).word,
    sendDrawing: async (word, strokes) => { await api(`${r}/scribble/turn`, { word, strokes }, 'POST'); },
    turns: async () => (await api<{ turns: Turn[] }>(`${r}/scribble/turns`)).turns,
    turnAction: (id, body) => api(`${r}/scribble/turns/${id}`, body, 'POST'),
    truthDare: async () => (await api<{ view: TdView | null }>(`${r}/truth-dare`)).view,
    tdAction: async body => (await api<{ view: TdView | null }>(`${r}/truth-dare`, body, 'POST')).view,
    quiz: () => api<QuizState>(`${r}/quiz`),
    quizAnswer: (answers, ids) => api<QuizState>(`${r}/quiz/answers`, { answers, ids }, 'POST'),
    quizGuess: (about, guesses) => api(`${r}/quiz/guess`, { about, guesses }, 'POST'),
  };
}

