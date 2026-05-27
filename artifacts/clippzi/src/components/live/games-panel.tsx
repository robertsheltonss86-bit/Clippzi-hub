import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useGroupRoom, useRoomData, useRebroadcastOnJoin } from "./livekit-group-room";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Gamepad2, Hash, X, Heart, Sparkles, RotateCw } from "lucide-react";

type GameKind = "tictactoe" | "hangman" | "truth_or_dare" | "dating";

type GameMsg =
  | { t: "game.start"; kind: GameKind; by: number; id: string }
  | { t: "game.end"; id: string }
  | { t: "ttt.move"; id: string; cell: number; mark: "X" | "O" }
  | { t: "ttt.reset"; id: string }
  | { t: "hm.init"; id: string; word: string; setterId: number }
  | { t: "hm.guess"; id: string; letter: string; by: number }
  | { t: "tod.spin"; id: string; targetId: number; dare: string }
  | { t: "dating.start"; id: string; pickerId: number; contestantIds: number[]; question: string }
  | { t: "dating.answer"; id: string; by: number; answer: string }
  | { t: "dating.pick"; id: string; winnerId: number };

const uid = () => Math.random().toString(36).slice(2, 8);

// ===== Tic-Tac-Toe =====
function TicTacToe({ gameId, starterId }: { gameId: string; starterId: number }) {
  const { userId } = useCurrentUser();
  const { participants } = useGroupRoom();
  const [board, setBoard] = useState<Array<"" | "X" | "O">>(Array(9).fill(""));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const isStarter = userId === starterId;
  // Pick first two publishers as X and O
  const players = useMemo(() => {
    const ids = participants
      .map((p) => {
        const m = p.identity.match(/-(\d+)$/);
        return m ? Number(m[1]) : null;
      })
      .filter((v): v is number => v !== null);
    return { X: ids[0] ?? null, O: ids[1] ?? null };
  }, [participants]);

  const myMark: "X" | "O" | null = userId === players.X ? "X" : userId === players.O ? "O" : null;

  const { send } = useRoomData(
    useCallback((msg: any, from: any) => {
      if (msg.id !== gameId) return;
      if (msg.t === "ttt.move") {
        // Validate: sender's identity must end in -{playerId} matching the mark
        const senderId = from ? Number(from.identity.match(/-(\d+)$/)?.[1]) : userId;
        const expected = msg.mark === "X" ? players.X : players.O;
        if (expected != null && senderId !== expected) return;
        setBoard((b) => {
          if (b[msg.cell] !== "") return b;
          const nb = [...b]; nb[msg.cell] = msg.mark;
          return nb;
        });
        setTurn(msg.mark === "X" ? "O" : "X");
      } else if (msg.t === "ttt.reset") {
        setBoard(Array(9).fill("")); setTurn("X");
      } else if (msg.t === "ttt.snapshot") {
        setBoard(msg.board); setTurn(msg.turn);
      }
    }, [gameId, players, userId]),
  );

  // Late joiners: starter re-broadcasts state when a new publisher joins
  useRebroadcastOnJoin(isStarter ? { t: "ttt.snapshot", id: gameId, board, turn } : null);

  const winLines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const winner = winLines.map(([a,b,c]) => board[a] && board[a] === board[b] && board[a] === board[c] ? board[a] : null).find(Boolean) || null;
  const full = board.every(c => c !== "");

  const play = (cell: number) => {
    if (board[cell] !== "" || winner || !myMark || turn !== myMark) return;
    send({ t: "ttt.move", id: gameId, cell, mark: myMark } as GameMsg);
    setBoard((b) => { const nb=[...b]; nb[cell]=myMark; return nb; });
    setTurn(myMark === "X" ? "O" : "X");
  };

  const reset = () => send({ t: "ttt.reset", id: gameId } as GameMsg);

  return (
    <div className="space-y-3">
      <div className="text-center text-sm">
        {winner ? <span className="text-accent font-bold">🏆 {winner} wins!</span>
          : full ? <span className="text-muted-foreground">Cat's game</span>
          : myMark ? <span>You are <b className="text-primary">{myMark}</b> — {turn === myMark ? <b className="text-accent">your turn</b> : `waiting for ${turn}`}</span>
          : <span className="text-muted-foreground">Watching — {turn}'s turn</span>}
      </div>
      <div className="grid grid-cols-3 gap-1.5 max-w-[240px] mx-auto" data-testid="ttt-board">
        {board.map((c, i) => (
          <button
            key={i}
            onClick={() => play(i)}
            disabled={!!c || !!winner || !myMark || turn !== myMark}
            className="aspect-square bg-black/60 border-2 border-white/10 rounded-lg text-3xl font-extrabold disabled:opacity-90 hover:bg-black/40 transition"
            data-testid={`ttt-cell-${i}`}
          >
            <span className={c === "X" ? "text-primary" : "text-secondary"}>{c}</span>
          </button>
        ))}
      </div>
      <Button onClick={reset} variant="ghost" size="sm" className="w-full"><RotateCw className="w-3 h-3 mr-1" /> Reset</Button>
    </div>
  );
}

// ===== Hangman =====
const HM_MAX_WRONG = 6;
function Hangman({ gameId, starterId }: { gameId: string; starterId: number }) {
  const { userId } = useCurrentUser();
  const [word, setWord] = useState<string>("");
  const [setterId, setSetterId] = useState<number>(starterId);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const isStarter = userId === starterId;
  const isSetter = userId === setterId;

  const { send } = useRoomData(
    useCallback((msg: any, from: any) => {
      if (msg.id !== gameId) return;
      // Authoritative: only the game starter may set/snapshot the word
      const senderId = from ? Number(from.identity.match(/-(\d+)$/)?.[1]) : userId;
      if (msg.t === "hm.init") {
        if (senderId !== starterId) return;
        setWord(msg.word.toUpperCase()); setSetterId(msg.setterId); setGuesses([]);
      } else if (msg.t === "hm.guess") {
        setGuesses((g) => g.includes(msg.letter) ? g : [...g, msg.letter]);
      } else if (msg.t === "hm.snapshot") {
        if (senderId !== starterId) return;
        setWord(msg.word); setSetterId(msg.setterId); setGuesses(msg.guesses);
      }
    }, [gameId, starterId, userId]),
  );

  useRebroadcastOnJoin(isStarter && word ? { t: "hm.snapshot", id: gameId, word, setterId, guesses } : null);

  const initWord = () => {
    const w = draft.trim().toUpperCase();
    if (!/^[A-Z ]{3,20}$/.test(w)) return;
    send({ t: "hm.init", id: gameId, word: w, setterId: userId! } as GameMsg);
    setWord(w); setGuesses([]); setDraft("");
  };

  const guess = (letter: string) => {
    if (guesses.includes(letter) || isSetter) return;
    send({ t: "hm.guess", id: gameId, letter, by: userId! } as GameMsg);
    setGuesses((g) => [...g, letter]);
  };

  const wrong = guesses.filter((l) => !word.includes(l));
  const masked = word.split("").map((c) => c === " " ? " " : guesses.includes(c) ? c : "_").join(" ");
  const won = word && word.split("").every((c) => c === " " || guesses.includes(c));
  const lost = wrong.length >= HM_MAX_WRONG;

  if (!word) {
    // Only the game starter sets the word; everyone else waits
    return isStarter ? (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">Pick a word for everyone to guess (3–20 letters).</p>
        <div className="flex gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} placeholder="WORD" className="font-mono uppercase" maxLength={20} data-testid="hm-word-input" />
          <Button onClick={initWord} className="bg-primary text-black font-bold">Set</Button>
        </div>
      </div>
    ) : <p className="text-sm text-muted-foreground text-center">Waiting for word…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="text-center font-mono text-3xl tracking-widest text-accent font-bold" data-testid="hm-word">{masked}</div>
      <div className="text-center text-xs text-muted-foreground">
        Wrong: <span className="text-secondary font-bold">{wrong.length}</span>/{HM_MAX_WRONG} — {wrong.join(" ")}
      </div>
      {won && <div className="text-center text-accent font-bold">🎉 Solved!</div>}
      {lost && <div className="text-center text-secondary font-bold">💀 Game over — was "{word}"</div>}
      <div className="grid grid-cols-9 gap-1">
        {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((l) => {
          const used = guesses.includes(l);
          const right = used && word.includes(l);
          return (
            <button
              key={l}
              onClick={() => guess(l)}
              disabled={used || won || lost || isSetter}
              className={`aspect-square rounded text-xs font-bold border ${
                right ? "bg-accent text-black border-accent" : used ? "bg-secondary/30 text-secondary line-through border-secondary/30" : "bg-black/60 text-white border-white/10 hover:bg-black/40"
              }`}
              data-testid={`hm-key-${l}`}
            >{l}</button>
          );
        })}
      </div>
      {isSetter && <p className="text-xs text-center text-muted-foreground">You set the word — let others guess.</p>}
    </div>
  );
}

// ===== Truth or Dare wheel =====
const DARES = [
  "Sing the chorus of your favorite song.",
  "Do your best dance move for 10 seconds.",
  "Tell a 30-second story about your worst date.",
  "Speak in an accent for the next minute.",
  "Show the last photo in your camera roll (safe ones only!).",
  "Do 10 jumping jacks on camera.",
  "Imitate another co-host.",
  "Confess your weirdest food combo.",
  "Whisper everything you say for 30 seconds.",
  "Compliment every other co-host.",
];

function TruthOrDare({ gameId, starterId }: { gameId: string; starterId: number }) {
  const { userId } = useCurrentUser();
  const { participants } = useGroupRoom();
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState<{ id: number; name: string; dare: string } | null>(null);
  const isStarter = userId === starterId;

  const { send } = useRoomData(
    useCallback((msg: any) => {
      if (msg.id !== gameId) return;
      if (msg.t === "tod.spin") {
        const p = participants.find((p) => p.identity.endsWith(`-${msg.targetId}`));
        setPicked({ id: msg.targetId, name: p?.name || "Player", dare: msg.dare });
        setSpinning(false);
      }
    }, [gameId, participants]),
  );

  useRebroadcastOnJoin(isStarter && picked ? { t: "tod.spin", id: gameId, targetId: picked.id, dare: picked.dare } : null);

  const spin = () => {
    if (participants.length === 0) return;
    setSpinning(true);
    setTimeout(() => {
      const p = participants[Math.floor(Math.random() * participants.length)];
      const m = p.identity.match(/-(\d+)$/);
      const targetId = m ? Number(m[1]) : 0;
      const dare = DARES[Math.floor(Math.random() * DARES.length)];
      send({ t: "tod.spin", id: gameId, targetId, dare } as GameMsg);
      setPicked({ id: targetId, name: p.name || "Player", dare });
      setSpinning(false);
    }, 1500);
  };

  return (
    <div className="space-y-4 text-center">
      <div className={`w-32 h-32 mx-auto rounded-full border-4 border-accent flex items-center justify-center bg-gradient-to-br from-primary/30 via-accent/30 to-secondary/30 ${spinning ? "animate-spin" : ""}`}>
        <Sparkles className="w-12 h-12 text-accent" />
      </div>
      <Button onClick={spin} disabled={spinning} className="bg-accent text-black font-extrabold" data-testid="button-spin-tod">
        {spinning ? "Spinning…" : "Spin the wheel"}
      </Button>
      {picked && !spinning && (
        <div className="bg-black/60 rounded-lg p-3 border border-accent/40">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Truth or Dare</div>
          <div className="text-lg font-bold text-accent">{picked.name}</div>
          <div className="text-sm text-white mt-1">{picked.dare}</div>
        </div>
      )}
    </div>
  );
}

// ===== Dating Game =====
function DatingGame({ gameId, starterId }: { gameId: string; starterId: number }) {
  const { userId } = useCurrentUser();
  const { participants } = useGroupRoom();
  const [pickerId, setPickerId] = useState<number | null>(null);
  const [contestantIds, setContestantIds] = useState<number[]>([]);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [draftQ, setDraftQ] = useState("If we went on a perfect first date, where would we go and why?");
  const [draftA, setDraftA] = useState("");

  const isStarter = userId === starterId;
  const isPicker = userId === pickerId;
  const amContestant = userId != null && contestantIds.includes(userId);

  const { send } = useRoomData(
    useCallback((msg: any) => {
      if (msg.id !== gameId) return;
      if (msg.t === "dating.start") {
        setPickerId(msg.pickerId); setContestantIds(msg.contestantIds); setQuestion(msg.question);
        setAnswers({}); setWinnerId(null);
      } else if (msg.t === "dating.answer") {
        setAnswers((a) => ({ ...a, [msg.by]: msg.answer }));
      } else if (msg.t === "dating.pick") {
        setWinnerId(msg.winnerId);
      } else if (msg.t === "dating.snapshot") {
        setPickerId(msg.pickerId); setContestantIds(msg.contestantIds); setQuestion(msg.question);
        setAnswers(msg.answers || {}); setWinnerId(msg.winnerId ?? null);
      }
    }, [gameId]),
  );

  useRebroadcastOnJoin(isStarter && pickerId != null ? {
    t: "dating.snapshot", id: gameId, pickerId, contestantIds, question, answers, winnerId,
  } : null);

  const start = () => {
    const ids = participants.map((p) => {
      const m = p.identity.match(/-(\d+)$/); return m ? Number(m[1]) : null;
    }).filter((v): v is number => v !== null);
    if (ids.length < 2) return;
    const picker = ids[0];
    const cont = ids.slice(1, 5);
    send({ t: "dating.start", id: gameId, pickerId: picker, contestantIds: cont, question: draftQ } as GameMsg);
    setPickerId(picker); setContestantIds(cont); setQuestion(draftQ); setAnswers({}); setWinnerId(null);
  };

  const answer = () => {
    if (!draftA.trim() || !userId) return;
    send({ t: "dating.answer", id: gameId, by: userId, answer: draftA.trim() } as GameMsg);
    setAnswers((a) => ({ ...a, [userId]: draftA.trim() }));
    setDraftA("");
  };

  const pick = (wid: number) => {
    if (!isPicker) return;
    send({ t: "dating.pick", id: gameId, winnerId: wid } as GameMsg);
    setWinnerId(wid);
  };

  const nameOf = (uid: number) => participants.find((p) => p.identity.endsWith(`-${uid}`))?.name || `Player ${uid}`;

  if (pickerId == null) {
    return isStarter ? (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground text-center">Pick a question. First co-host becomes the picker; next up to 4 are contestants.</p>
        <Input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="Your question" data-testid="dating-question-input" />
        <Button onClick={start} className="w-full bg-primary text-black font-bold"><Heart className="w-4 h-4 mr-2" /> Start Dating Game</Button>
      </div>
    ) : <p className="text-sm text-muted-foreground text-center">Waiting for host to set up…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="bg-black/60 rounded-lg p-3 border border-secondary/40">
        <div className="text-xs uppercase tracking-wider text-secondary mb-1">Picker: {nameOf(pickerId)}</div>
        <div className="text-sm text-white">❤️ {question}</div>
      </div>

      {amContestant && !winnerId && (
        <div className="flex gap-2">
          <Input value={draftA} onChange={(e) => setDraftA(e.target.value)} placeholder={answers[userId!] ? "Update your answer" : "Your answer…"} data-testid="dating-answer-input" />
          <Button onClick={answer} className="bg-primary text-black font-bold">Send</Button>
        </div>
      )}

      <div className="space-y-2">
        {contestantIds.map((cid, i) => (
          <div
            key={cid}
            className={`rounded-lg p-2 border ${winnerId === cid ? "border-accent bg-accent/15" : "border-white/10 bg-black/40"}`}
            data-testid={`contestant-${cid}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-primary">#{i + 1} {isPicker ? nameOf(cid) : "Hidden"}</span>
              {isPicker && !winnerId && (
                <Button size="sm" onClick={() => pick(cid)} className="h-7 bg-secondary hover:bg-secondary/80 text-white text-xs">Pick</Button>
              )}
              {winnerId === cid && <span className="text-xs font-extrabold text-accent">💘 Picked!</span>}
            </div>
            <div className="text-sm text-white/90 mt-1 min-h-[1.25rem]">
              {answers[cid] ? <>"{answers[cid]}"</> : <span className="text-muted-foreground italic">…thinking</span>}
            </div>
          </div>
        ))}
      </div>

      {winnerId && (
        <div className="text-center text-accent font-bold">
          🌹 {nameOf(pickerId)} picked {nameOf(winnerId)}!
        </div>
      )}
    </div>
  );
}

// ===== Launcher =====
export function GamesPanel() {
  const { userId } = useCurrentUser();
  const { canPublish } = useGroupRoom();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<{ kind: GameKind; id: string; starterId: number } | null>(null);

  const { send } = useRoomData(
    useCallback((msg: any) => {
      if (msg.t === "game.start") setActive({ kind: msg.kind, id: msg.id, starterId: msg.by });
      else if (msg.t === "game.end" && active?.id === msg.id) setActive(null);
    }, [active]),
  );

  // Active-game starter re-announces on new joiner so late publishers know there's a game running
  useRebroadcastOnJoin(active && active.starterId === userId ? { t: "game.start", kind: active.kind, by: active.starterId, id: active.id } : null);

  const launch = (kind: GameKind) => {
    if (!userId) return;
    const id = uid();
    send({ t: "game.start", kind, by: userId, id } as GameMsg);
    setActive({ kind, id, starterId: userId });
    setOpen(false);
  };
  const endGame = () => {
    if (!active) return;
    send({ t: "game.end", id: active.id } as GameMsg);
    setActive(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            size="sm"
            className="rounded-full bg-accent hover:bg-accent/80 text-black h-8 px-3 text-xs gap-1 font-bold"
            data-testid="button-games"
          >
            <Gamepad2 className="w-3.5 h-3.5" /> Games
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><Gamepad2 className="w-5 h-5 text-accent" /> Group Games</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <GameTile emoji="❌⭕" name="Tic-Tac-Toe" subtitle="1v1" onClick={() => launch("tictactoe")} disabled={!canPublish} testid="launch-ttt" />
            <GameTile emoji="🪢" name="Hangman" subtitle="Setter vs all" onClick={() => launch("hangman")} disabled={!canPublish} testid="launch-hangman" />
            <GameTile emoji="🎡" name="Truth or Dare" subtitle="Spin & dare" onClick={() => launch("truth_or_dare")} disabled={!canPublish} testid="launch-tod" />
            <GameTile emoji="🌹" name="Dating Game" subtitle="Bachelor-style" onClick={() => launch("dating")} disabled={!canPublish} testid="launch-dating" />
          </div>
          {!canPublish && <p className="text-xs text-center text-muted-foreground pt-2">Only co-hosts can start games.</p>}
        </DialogContent>
      </Dialog>

      {active && (
        <div className="absolute right-2 top-16 z-40 w-[320px] max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl p-3 shadow-2xl" data-testid="game-overlay">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Hash className="w-4 h-4 text-accent" />
              {active.kind === "tictactoe" && "Tic-Tac-Toe"}
              {active.kind === "hangman" && "Hangman"}
              {active.kind === "truth_or_dare" && "Truth or Dare"}
              {active.kind === "dating" && "Dating Game"}
            </div>
            <Button size="icon" variant="ghost" onClick={endGame} className="h-7 w-7" data-testid="button-end-game">
              <X className="w-4 h-4" />
            </Button>
          </div>
          {active.kind === "tictactoe" && <TicTacToe gameId={active.id} starterId={active.starterId} />}
          {active.kind === "hangman" && <Hangman gameId={active.id} starterId={active.starterId} />}
          {active.kind === "truth_or_dare" && <TruthOrDare gameId={active.id} starterId={active.starterId} />}
          {active.kind === "dating" && <DatingGame gameId={active.id} starterId={active.starterId} />}
        </div>
      )}
    </>
  );
}

function GameTile({ emoji, name, subtitle, onClick, disabled, testid }: { emoji: string; name: string; subtitle: string; onClick: () => void; disabled?: boolean; testid: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-black/60 hover:bg-black/40 disabled:opacity-50 border border-white/10 hover:border-accent rounded-xl p-3 text-center transition group"
      data-testid={testid}
    >
      <div className="text-3xl mb-1 group-hover:scale-110 transition">{emoji}</div>
      <div className="text-sm font-bold text-white">{name}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{subtitle}</div>
    </button>
  );
}
