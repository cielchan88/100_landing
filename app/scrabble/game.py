"""Game state: bag, racks, turns, serialization."""
from __future__ import annotations

import random
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from . import ai
from .engine import (
    BOARD_SIZE,
    LETTER_VALUES,
    RACK_SIZE,
    TILE_DISTRIBUTION,
    Board,
    Move,
    MoveError,
    PlacedTile,
    ScoredMove,
    apply_move,
    premium_at,
    validate_and_score,
)


def _new_bag(rng: random.Random) -> List[str]:
    bag: List[str] = []
    for letter, count in TILE_DISTRIBUTION.items():
        bag.extend([letter] * count)
    rng.shuffle(bag)
    return bag


def _draw(bag: List[str], n: int) -> List[str]:
    drawn = bag[:n]
    del bag[:n]
    return drawn


@dataclass
class TurnLog:
    actor: str  # "human" or "ai"
    kind: str  # "move", "pass", "exchange"
    word: Optional[str] = None
    score: int = 0
    words: List[Dict] = field(default_factory=list)
    tiles: List[Dict] = field(default_factory=list)
    direction: Optional[str] = None


@dataclass
class Game:
    id: str
    board: Board
    bag: List[str]
    human_rack: List[str]
    ai_rack: List[str]
    human_score: int = 0
    ai_score: int = 0
    turn: str = "human"  # "human" or "ai"
    history: List[TurnLog] = field(default_factory=list)
    consecutive_passes: int = 0
    game_over: bool = False
    winner: Optional[str] = None  # "human", "ai", or "tie"

    @classmethod
    def new(cls, seed: Optional[int] = None) -> "Game":
        rng = random.Random(seed)
        bag = _new_bag(rng)
        human_rack = _draw(bag, RACK_SIZE)
        ai_rack = _draw(bag, RACK_SIZE)
        return cls(
            id=uuid.uuid4().hex,
            board=Board(),
            bag=bag,
            human_rack=human_rack,
            ai_rack=ai_rack,
        )

    # ----- serialization -----

    def to_dict(self, reveal_ai_rack: bool = False) -> Dict:
        return {
            "id": self.id,
            "board": self.board.to_serializable(),
            "premiums": [
                [premium_at(r, c).value for c in range(BOARD_SIZE)]
                for r in range(BOARD_SIZE)
            ],
            "human_rack": list(self.human_rack),
            "ai_rack_count": len(self.ai_rack),
            "ai_rack": list(self.ai_rack) if reveal_ai_rack else None,
            "bag_count": len(self.bag),
            "human_score": self.human_score,
            "ai_score": self.ai_score,
            "turn": self.turn,
            "history": [
                {
                    "actor": h.actor,
                    "kind": h.kind,
                    "word": h.word,
                    "score": h.score,
                    "words": h.words,
                    "tiles": h.tiles,
                    "direction": h.direction,
                }
                for h in self.history
            ],
            "game_over": self.game_over,
            "winner": self.winner,
        }

    # ----- human move handling -----

    def _rack_can_supply(self, tiles: List[Dict], rack: List[str]) -> Optional[List[int]]:
        """Return rack indices to consume for the move, or None if infeasible."""
        remaining = list(rack)
        consumed_indices: List[int] = []
        for t in tiles:
            letter = t["letter"].upper()
            is_blank = bool(t.get("is_blank"))
            if is_blank:
                if "?" in remaining:
                    idx = remaining.index("?")
                    consumed_indices.append(idx)
                    remaining[idx] = None
                else:
                    return None
            else:
                if letter in remaining:
                    idx = remaining.index(letter)
                    consumed_indices.append(idx)
                    remaining[idx] = None
                else:
                    return None
        return consumed_indices

    def submit_human_move(self, tiles: List[Dict]) -> ScoredMove:
        if self.game_over:
            raise MoveError("Game is over.")
        if self.turn != "human":
            raise MoveError("Not your turn.")
        consumed = self._rack_can_supply(tiles, self.human_rack)
        if consumed is None:
            raise MoveError("Your rack does not contain the required tiles.")
        scored = validate_and_score(self.board, Move(tiles=tiles))
        # commit
        apply_move(self.board, scored)
        # remove tiles from rack (in reverse to keep indices valid)
        for idx in sorted(set(consumed), reverse=True):
            del self.human_rack[idx]
        # refill
        refill = _draw(self.bag, RACK_SIZE - len(self.human_rack))
        self.human_rack.extend(refill)
        self.human_score += scored.score
        self.history.append(TurnLog(
            actor="human",
            kind="move",
            word=scored.main_word,
            score=scored.score,
            words=[{"word": w.word, "score": w.score} for w in scored.words],
            tiles=scored.tiles,
            direction=scored.direction,
        ))
        self.consecutive_passes = 0
        self._check_end_after_move(self.human_rack, "human")
        if not self.game_over:
            self.turn = "ai"
        return scored

    def human_pass(self) -> None:
        if self.game_over:
            raise MoveError("Game is over.")
        if self.turn != "human":
            raise MoveError("Not your turn.")
        self.history.append(TurnLog(actor="human", kind="pass"))
        self.consecutive_passes += 1
        self._check_end_by_passes()
        if not self.game_over:
            self.turn = "ai"

    def human_exchange(self, indices: List[int]) -> None:
        if self.game_over:
            raise MoveError("Game is over.")
        if self.turn != "human":
            raise MoveError("Not your turn.")
        if not indices:
            raise MoveError("Select at least one tile to exchange.")
        if len(self.bag) < 1:
            raise MoveError("Cannot exchange: bag is empty.")
        unique = sorted(set(indices), reverse=True)
        if any(i < 0 or i >= len(self.human_rack) for i in unique):
            raise MoveError("Invalid tile selection.")
        returned = [self.human_rack[i] for i in unique]
        for i in unique:
            del self.human_rack[i]
        # draw replacements first, then return exchanged tiles to bag (so they can't be redrawn)
        replacements = _draw(self.bag, len(returned))
        self.human_rack.extend(replacements)
        self.bag.extend(returned)
        random.shuffle(self.bag)
        self.history.append(TurnLog(actor="human", kind="exchange", score=0))
        self.consecutive_passes += 1
        self._check_end_by_passes()
        if not self.game_over:
            self.turn = "ai"

    # ----- AI move -----

    def play_ai_turn(self) -> TurnLog:
        if self.game_over:
            raise MoveError("Game is over.")
        if self.turn != "ai":
            raise MoveError("Not AI's turn.")
        scored = ai.best_move(self.board, list(self.ai_rack))
        if scored is None:
            # try exchange if possible, else pass
            if len(self.bag) >= 1 and self.ai_rack:
                indices = list(range(len(self.ai_rack)))
                returned = [self.ai_rack[i] for i in indices]
                self.ai_rack = []
                replacements = _draw(self.bag, len(returned))
                self.ai_rack.extend(replacements)
                self.bag.extend(returned)
                random.shuffle(self.bag)
                log = TurnLog(actor="ai", kind="exchange", score=0)
            else:
                log = TurnLog(actor="ai", kind="pass")
            self.history.append(log)
            self.consecutive_passes += 1
            self._check_end_by_passes()
            if not self.game_over:
                self.turn = "human"
            return log

        # consume from ai_rack
        consumed = self._rack_can_supply(scored.tiles, self.ai_rack)
        # consumed should be valid since AI only used rack tiles
        apply_move(self.board, scored)
        for idx in sorted(set(consumed or []), reverse=True):
            del self.ai_rack[idx]
        refill = _draw(self.bag, RACK_SIZE - len(self.ai_rack))
        self.ai_rack.extend(refill)
        self.ai_score += scored.score
        log = TurnLog(
            actor="ai",
            kind="move",
            word=scored.main_word,
            score=scored.score,
            words=[{"word": w.word, "score": w.score} for w in scored.words],
            tiles=scored.tiles,
            direction=scored.direction,
        )
        self.history.append(log)
        self.consecutive_passes = 0
        self._check_end_after_move(self.ai_rack, "ai")
        if not self.game_over:
            self.turn = "human"
        return log

    # ----- end of game -----

    def _check_end_after_move(self, rack: List[str], who: str) -> None:
        if not rack and not self.bag:
            # The player who emptied their rack gets bonus = sum of opponent's remaining tile values * 2
            opp_rack = self.ai_rack if who == "human" else self.human_rack
            bonus = sum(LETTER_VALUES.get(t, 0) for t in opp_rack)
            penalty = bonus
            if who == "human":
                self.human_score += bonus
                self.ai_score -= penalty
            else:
                self.ai_score += bonus
                self.human_score -= penalty
            self._finalize_winner()

    def _check_end_by_passes(self) -> None:
        # End if both players pass/exchange twice consecutively (4 in a row counting two per side).
        if self.consecutive_passes >= 4:
            # subtract each player's rack value from their score
            self.human_score -= sum(LETTER_VALUES.get(t, 0) for t in self.human_rack)
            self.ai_score -= sum(LETTER_VALUES.get(t, 0) for t in self.ai_rack)
            self._finalize_winner()

    def _finalize_winner(self) -> None:
        self.game_over = True
        if self.human_score > self.ai_score:
            self.winner = "human"
        elif self.ai_score > self.human_score:
            self.winner = "ai"
        else:
            self.winner = "tie"


class GameStore:
    """Thread-safe in-memory game store with TTL eviction."""

    def __init__(self, ttl_seconds: int = 60 * 60 * 6) -> None:
        self._games: Dict[str, Game] = {}
        self._last_seen: Dict[str, float] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds

    def _evict(self) -> None:
        now = time.time()
        stale = [gid for gid, ts in self._last_seen.items() if now - ts > self._ttl]
        for gid in stale:
            self._games.pop(gid, None)
            self._last_seen.pop(gid, None)

    def create(self, seed: Optional[int] = None) -> Game:
        with self._lock:
            self._evict()
            game = Game.new(seed=seed)
            self._games[game.id] = game
            self._last_seen[game.id] = time.time()
            return game

    def get(self, game_id: str) -> Optional[Game]:
        with self._lock:
            game = self._games.get(game_id)
            if game is not None:
                self._last_seen[game_id] = time.time()
            return game

    def touch(self, game_id: str) -> None:
        with self._lock:
            if game_id in self._games:
                self._last_seen[game_id] = time.time()


store = GameStore()
