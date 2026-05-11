"""Scrabble board, tiles, scoring, and move validation."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

from .dictionary import is_word

BOARD_SIZE = 15
CENTER = (7, 7)
RACK_SIZE = 7
BINGO_BONUS = 50

LETTER_VALUES: Dict[str, int] = {
    "A": 1, "B": 3, "C": 3, "D": 2, "E": 1, "F": 4, "G": 2, "H": 4,
    "I": 1, "J": 8, "K": 5, "L": 1, "M": 3, "N": 1, "O": 1, "P": 3,
    "Q": 10, "R": 1, "S": 1, "T": 1, "U": 1, "V": 4, "W": 4, "X": 8,
    "Y": 4, "Z": 10, "?": 0,
}

TILE_DISTRIBUTION: Dict[str, int] = {
    "A": 9, "B": 2, "C": 2, "D": 4, "E": 12, "F": 2, "G": 3, "H": 2,
    "I": 9, "J": 1, "K": 1, "L": 4, "M": 2, "N": 6, "O": 8, "P": 2,
    "Q": 1, "R": 6, "S": 4, "T": 6, "U": 4, "V": 2, "W": 2, "X": 1,
    "Y": 2, "Z": 1, "?": 2,
}


class PremiumKind(str, Enum):
    NONE = "none"
    DL = "dl"  # double letter
    TL = "tl"  # triple letter
    DW = "dw"  # double word
    TW = "tw"  # triple word


_TW = {(0, 0), (0, 7), (0, 14), (7, 0), (7, 14), (14, 0), (14, 7), (14, 14)}
_DW = {(1, 1), (2, 2), (3, 3), (4, 4),
       (1, 13), (2, 12), (3, 11), (4, 10),
       (13, 1), (12, 2), (11, 3), (10, 4),
       (13, 13), (12, 12), (11, 11), (10, 10),
       (7, 7)}
_TL = {(1, 5), (1, 9), (5, 1), (5, 5), (5, 9), (5, 13),
       (9, 1), (9, 5), (9, 9), (9, 13), (13, 5), (13, 9)}
_DL = {(0, 3), (0, 11), (2, 6), (2, 8), (3, 0), (3, 7), (3, 14),
       (6, 2), (6, 6), (6, 8), (6, 12),
       (7, 3), (7, 11),
       (8, 2), (8, 6), (8, 8), (8, 12),
       (11, 0), (11, 7), (11, 14), (12, 6), (12, 8),
       (14, 3), (14, 11)}


def premium_at(row: int, col: int) -> PremiumKind:
    p = (row, col)
    if p in _TW:
        return PremiumKind.TW
    if p in _DW:
        return PremiumKind.DW
    if p in _TL:
        return PremiumKind.TL
    if p in _DL:
        return PremiumKind.DL
    return PremiumKind.NONE


@dataclass
class PlacedTile:
    """A tile already locked onto the board (from previous turns)."""
    letter: str  # uppercase A-Z
    is_blank: bool = False


@dataclass
class Move:
    """A proposed move: tiles placed on this turn."""
    tiles: List[Dict]  # [{"row": int, "col": int, "letter": "A", "is_blank": bool}]
    direction: str = "across"  # "across" or "down" — inferred when validating


@dataclass
class ScoredWord:
    word: str
    score: int


@dataclass
class ScoredMove:
    main_word: str
    words: List[ScoredWord]
    score: int
    tiles: List[Dict]
    direction: str


class Board:
    """15x15 board of PlacedTile or None."""

    def __init__(self) -> None:
        self.grid: List[List[Optional[PlacedTile]]] = [
            [None] * BOARD_SIZE for _ in range(BOARD_SIZE)
        ]

    def is_empty(self) -> bool:
        return all(cell is None for row in self.grid for cell in row)

    def at(self, r: int, c: int) -> Optional[PlacedTile]:
        if 0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE:
            return self.grid[r][c]
        return None

    def set(self, r: int, c: int, tile: PlacedTile) -> None:
        self.grid[r][c] = tile

    def clone(self) -> "Board":
        b = Board()
        for r in range(BOARD_SIZE):
            for c in range(BOARD_SIZE):
                t = self.grid[r][c]
                if t is not None:
                    b.grid[r][c] = PlacedTile(letter=t.letter, is_blank=t.is_blank)
        return b

    def to_serializable(self) -> List[List[Optional[Dict]]]:
        return [
            [
                None if cell is None else {"letter": cell.letter, "is_blank": cell.is_blank}
                for cell in row
            ]
            for row in self.grid
        ]


def _infer_direction(tiles: List[Dict]) -> Optional[str]:
    if len(tiles) == 1:
        return "across"  # single-tile move: direction is ambiguous; default across
    rows = {t["row"] for t in tiles}
    cols = {t["col"] for t in tiles}
    if len(rows) == 1:
        return "across"
    if len(cols) == 1:
        return "down"
    return None


class MoveError(ValueError):
    pass


def _collect_word(board: Board, r: int, c: int, dr: int, dc: int) -> Tuple[str, List[Tuple[int, int, str, bool]]]:
    """Walk to start of the run, then collect (letter, is_blank) along (dr,dc)."""
    # back up to start
    sr, sc = r, c
    while True:
        pr, pc = sr - dr, sc - dc
        if board.at(pr, pc) is not None:
            sr, sc = pr, pc
        else:
            break
    # collect forward
    letters: List[Tuple[int, int, str, bool]] = []
    cr, cc = sr, sc
    while True:
        t = board.at(cr, cc)
        if t is None:
            break
        letters.append((cr, cc, t.letter, t.is_blank))
        cr, cc = cr + dr, cc + dc
    word = "".join(x[2] for x in letters)
    return word, letters


def _score_word_run(
    letters: List[Tuple[int, int, str, bool]],
    newly_placed: Dict[Tuple[int, int], bool],
) -> int:
    score = 0
    word_multiplier = 1
    for (r, c, letter, is_blank) in letters:
        base = 0 if is_blank else LETTER_VALUES.get(letter, 0)
        is_new = (r, c) in newly_placed
        if is_new:
            prem = premium_at(r, c)
            if prem == PremiumKind.DL:
                base *= 2
            elif prem == PremiumKind.TL:
                base *= 3
            elif prem == PremiumKind.DW:
                word_multiplier *= 2
            elif prem == PremiumKind.TW:
                word_multiplier *= 3
        score += base
    return score * word_multiplier


def validate_and_score(
    board: Board,
    move: Move,
) -> ScoredMove:
    """Validate the move against board+dictionary, return scored move.

    Caller is responsible for verifying tiles came from the player's rack.
    """
    tiles = move.tiles
    if not tiles:
        raise MoveError("No tiles placed.")

    # Basic placement checks
    coords = [(t["row"], t["col"]) for t in tiles]
    if len(set(coords)) != len(coords):
        raise MoveError("Duplicate tile positions.")
    for r, c in coords:
        if not (0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE):
            raise MoveError("Tile out of bounds.")
        if board.at(r, c) is not None:
            raise MoveError("Tile placed on occupied square.")

    direction = _infer_direction(tiles)
    if direction is None:
        raise MoveError("Tiles must all be in one row or one column.")

    # On a board with existing tiles, single-tile moves may form either or both directions.
    # We pick "across" if it forms a horizontal word of length >= 2, otherwise "down".
    if len(tiles) == 1 and not board.is_empty():
        r, c = coords[0]
        # tentatively place
        place_tile = PlacedTile(letter=tiles[0]["letter"].upper(), is_blank=bool(tiles[0].get("is_blank")))
        board.set(r, c, place_tile)
        horiz, _ = _collect_word(board, r, c, 0, 1)
        vert, _ = _collect_word(board, r, c, 1, 0)
        board.grid[r][c] = None
        if len(horiz) >= 2 and len(vert) < 2:
            direction = "across"
        elif len(vert) >= 2 and len(horiz) < 2:
            direction = "down"
        elif len(horiz) >= 2 and len(vert) >= 2:
            direction = "across"  # both; doesn't matter for scoring
        else:
            raise MoveError("Tile must connect to form a word of at least two letters.")

    # Check contiguity in the placement direction (no gaps from board tiles allowed)
    if direction == "across":
        row = coords[0][0]
        if any(r != row for r, _ in coords):
            raise MoveError("All tiles must share the same row.")
        cols_sorted = sorted(c for _, c in coords)
        new_set = {(row, c) for c in cols_sorted}
        # fill between min and max must be either new tile or existing tile
        for c in range(cols_sorted[0], cols_sorted[-1] + 1):
            if (row, c) not in new_set and board.at(row, c) is None:
                raise MoveError("Gap in the placed tiles.")
    else:
        col = coords[0][1]
        if any(c != col for _, c in coords):
            raise MoveError("All tiles must share the same column.")
        rows_sorted = sorted(r for r, _ in coords)
        new_set = {(r, col) for r in rows_sorted}
        for r in range(rows_sorted[0], rows_sorted[-1] + 1):
            if (r, col) not in new_set and board.at(r, col) is None:
                raise MoveError("Gap in the placed tiles.")

    # First move must cover center; subsequent moves must touch an existing tile
    if board.is_empty():
        if CENTER not in set(coords):
            raise MoveError("First move must cover the center square.")
    else:
        touches = False
        for (r, c) in coords:
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                if board.at(r + dr, c + dc) is not None:
                    touches = True
                    break
            if touches:
                break
        if not touches:
            raise MoveError("Placed tiles must connect to existing tiles.")

    # Place tiles on a working board copy and validate words
    work = board.clone()
    newly_placed: Dict[Tuple[int, int], bool] = {}
    for t in tiles:
        r, c = t["row"], t["col"]
        letter = t["letter"].upper()
        if not letter.isalpha() or len(letter) != 1:
            raise MoveError(f"Invalid letter {letter!r}.")
        is_blank = bool(t.get("is_blank"))
        work.set(r, c, PlacedTile(letter=letter, is_blank=is_blank))
        newly_placed[(r, c)] = True

    # Collect main word
    if direction == "across":
        dr, dc = 0, 1
    else:
        dr, dc = 1, 0
    main_r, main_c = coords[0]
    main_word, main_letters = _collect_word(work, main_r, main_c, dr, dc)
    if len(main_word) < 2:
        raise MoveError("Word must be at least two letters.")
    if not is_word(main_word):
        raise MoveError(f"{main_word!r} is not in the dictionary.")

    words: List[ScoredWord] = []
    main_score = _score_word_run(main_letters, newly_placed)
    words.append(ScoredWord(word=main_word, score=main_score))
    total = main_score

    # Cross-words for each newly placed tile (perpendicular direction)
    cdr, cdc = (1, 0) if direction == "across" else (0, 1)
    for (r, c) in newly_placed:
        cword, cletters = _collect_word(work, r, c, cdr, cdc)
        if len(cword) >= 2:
            if not is_word(cword):
                raise MoveError(f"{cword!r} is not in the dictionary.")
            cscore = _score_word_run(cletters, newly_placed)
            words.append(ScoredWord(word=cword, score=cscore))
            total += cscore

    if len(tiles) == RACK_SIZE:
        total += BINGO_BONUS

    return ScoredMove(
        main_word=main_word,
        words=words,
        score=total,
        tiles=[
            {"row": t["row"], "col": t["col"], "letter": t["letter"].upper(),
             "is_blank": bool(t.get("is_blank"))}
            for t in tiles
        ],
        direction=direction,
    )


def apply_move(board: Board, scored: ScoredMove) -> None:
    for t in scored.tiles:
        board.set(t["row"], t["col"], PlacedTile(letter=t["letter"], is_blank=t["is_blank"]))
