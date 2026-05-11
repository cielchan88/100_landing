"""Greedy best-score move generator for the AI opponent.

Algorithm: classic anchor-square approach (Appel & Jacobson 1988) without GADDAG.
For each anchor (empty square adjacent to a tile, or the center on an empty board)
and each direction, build a "left part" of placed tiles, then extend rightward
through any board tiles and additional rack placements. Prefix-set pruning keeps
the search small; precomputed cross-checks ensure perpendicular words are valid.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Set, Tuple

from .dictionary import has_prefix, is_word
from .engine import (
    BOARD_SIZE,
    CENTER,
    Board,
    LETTER_VALUES,
    Move,
    MoveError,
    ScoredMove,
    validate_and_score,
)

_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _find_anchors(board: Board) -> List[Tuple[int, int]]:
    if board.is_empty():
        return [CENTER]
    anchors: List[Tuple[int, int]] = []
    for r in range(BOARD_SIZE):
        for c in range(BOARD_SIZE):
            if board.at(r, c) is not None:
                continue
            for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                if board.at(r + dr, c + dc) is not None:
                    anchors.append((r, c))
                    break
    return anchors


def _compute_cross_checks(board: Board, main_direction: str):
    """For each empty square, the set of letters that form a valid cross-word.

    Returns a 15x15 grid. Each cell is None (square occupied) or a tuple
    (allowed, has_cross) where `allowed` is a set of allowed letters or None
    meaning all 26 letters are valid (no cross-word formed).
    """
    if main_direction == "across":
        cdr, cdc = 1, 0
    else:
        cdr, cdc = 0, 1
    grid: List[List[Optional[Tuple[Optional[Set[str]], bool]]]] = [
        [None] * BOARD_SIZE for _ in range(BOARD_SIZE)
    ]
    for r in range(BOARD_SIZE):
        for c in range(BOARD_SIZE):
            if board.at(r, c) is not None:
                grid[r][c] = None
                continue
            above_letters: List[str] = []
            ar, ac = r - cdr, c - cdc
            while 0 <= ar < BOARD_SIZE and 0 <= ac < BOARD_SIZE and board.at(ar, ac) is not None:
                above_letters.append(board.at(ar, ac).letter)
                ar -= cdr
                ac -= cdc
            above_letters.reverse()
            below_letters: List[str] = []
            br, bc = r + cdr, c + cdc
            while 0 <= br < BOARD_SIZE and 0 <= bc < BOARD_SIZE and board.at(br, bc) is not None:
                below_letters.append(board.at(br, bc).letter)
                br += cdr
                bc += cdc
            if not above_letters and not below_letters:
                grid[r][c] = (None, False)
            else:
                above_str = "".join(above_letters)
                below_str = "".join(below_letters)
                allowed: Set[str] = set()
                for L in _ALPHA:
                    if is_word(above_str + L + below_str):
                        allowed.add(L)
                grid[r][c] = (allowed, True)
    return grid


def _candidate_key(played: List[Dict]) -> frozenset:
    return frozenset((p["row"], p["col"], p["letter"], p["is_blank"]) for p in played)


def _record(
    board: Board,
    played: List[Dict],
    direction: str,
    moves: List[ScoredMove],
    seen: Set[frozenset],
) -> None:
    key = _candidate_key(played)
    if key in seen:
        return
    seen.add(key)
    try:
        scored = validate_and_score(board, Move(tiles=list(played), direction=direction))
    except MoveError:
        return
    moves.append(scored)


def _extend_right(
    board: Board,
    prefix: str,
    r: int,
    c: int,
    rack: List[str],
    played: List[Dict],
    direction: str,
    cross,
    moves: List[ScoredMove],
    seen: Set[frozenset],
    anchor_r: int,
    anchor_c: int,
) -> None:
    if direction == "across":
        dr, dc = 0, 1
    else:
        dr, dc = 1, 0

    anchor_used = any(p["row"] == anchor_r and p["col"] == anchor_c for p in played)

    if not (0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE):
        if anchor_used and prefix and played and is_word(prefix):
            _record(board, played, direction, moves, seen)
        return

    tile = board.at(r, c)
    if tile is not None:
        new_prefix = prefix + tile.letter
        if has_prefix(new_prefix):
            _extend_right(
                board, new_prefix, r + dr, c + dc, rack, played,
                direction, cross, moves, seen, anchor_r, anchor_c,
            )
        return

    if anchor_used and prefix and played and is_word(prefix):
        _record(board, played, direction, moves, seen)

    if not rack:
        return

    ccheck = cross[r][c]
    allowed: Optional[Set[str]] = None if ccheck is None else ccheck[0]

    seen_letters: Set[str] = set()
    for i, rt in enumerate(rack):
        if rt == "?":
            if "?" in seen_letters:
                continue
            seen_letters.add("?")
            new_rack = rack[:i] + rack[i + 1:]
            for L in _ALPHA:
                if allowed is not None and L not in allowed:
                    continue
                new_prefix = prefix + L
                if not has_prefix(new_prefix):
                    continue
                new_played = played + [{"row": r, "col": c, "letter": L, "is_blank": True}]
                _extend_right(
                    board, new_prefix, r + dr, c + dc, new_rack, new_played,
                    direction, cross, moves, seen, anchor_r, anchor_c,
                )
        else:
            if rt in seen_letters:
                continue
            seen_letters.add(rt)
            L = rt
            if allowed is not None and L not in allowed:
                continue
            new_prefix = prefix + L
            if not has_prefix(new_prefix):
                continue
            new_rack = rack[:i] + rack[i + 1:]
            new_played = played + [{"row": r, "col": c, "letter": L, "is_blank": False}]
            _extend_right(
                board, new_prefix, r + dr, c + dc, new_rack, new_played,
                direction, cross, moves, seen, anchor_r, anchor_c,
            )


def _left_parts(
    board: Board,
    anchor_r: int,
    anchor_c: int,
    rack: List[str],
    direction: str,
    cross,
    moves: List[ScoredMove],
    seen: Set[frozenset],
    max_left: int,
) -> None:
    if direction == "across":
        dr, dc = 0, 1
    else:
        dr, dc = 1, 0

    def recurse(prefix: str, played: List[Dict], offset: int, current_rack: List[str]) -> None:
        # Try extending rightward from the anchor with the current prefix.
        if not prefix or has_prefix(prefix):
            _extend_right(
                board, prefix, anchor_r, anchor_c, current_rack, played,
                direction, cross, moves, seen, anchor_r, anchor_c,
            )
        if offset >= max_left:
            return
        next_offset = offset + 1
        nr = anchor_r - next_offset * dr
        nc = anchor_c - next_offset * dc
        if not (0 <= nr < BOARD_SIZE and 0 <= nc < BOARD_SIZE):
            return
        if board.at(nr, nc) is not None:
            return
        ccheck = cross[nr][nc]
        allowed: Optional[Set[str]] = None if ccheck is None else ccheck[0]
        seen_letters: Set[str] = set()
        for i, rt in enumerate(current_rack):
            if rt == "?":
                if "?" in seen_letters:
                    continue
                seen_letters.add("?")
                new_rack = current_rack[:i] + current_rack[i + 1:]
                for L in _ALPHA:
                    if allowed is not None and L not in allowed:
                        continue
                    new_prefix = L + prefix
                    if not has_prefix(new_prefix):
                        continue
                    new_played = played + [{"row": nr, "col": nc, "letter": L, "is_blank": True}]
                    recurse(new_prefix, new_played, next_offset, new_rack)
            else:
                if rt in seen_letters:
                    continue
                seen_letters.add(rt)
                L = rt
                if allowed is not None and L not in allowed:
                    continue
                new_prefix = L + prefix
                if not has_prefix(new_prefix):
                    continue
                new_rack = current_rack[:i] + current_rack[i + 1:]
                new_played = played + [{"row": nr, "col": nc, "letter": L, "is_blank": False}]
                recurse(new_prefix, new_played, next_offset, new_rack)

    recurse("", [], 0, rack)


def generate_moves(board: Board, rack: List[str]) -> List[ScoredMove]:
    moves: List[ScoredMove] = []
    seen: Set[frozenset] = set()
    anchors = _find_anchors(board)
    for direction in ("across", "down"):
        if direction == "across":
            dr, dc = 0, 1
        else:
            dr, dc = 1, 0
        cross = _compute_cross_checks(board, direction)
        for (ar, ac) in anchors:
            # Determine forced left prefix (if a board tile sits immediately to the left of anchor).
            pr, pc = ar - dr, ac - dc
            has_left_tile = (
                0 <= pr < BOARD_SIZE and 0 <= pc < BOARD_SIZE and board.at(pr, pc) is not None
            )
            if has_left_tile:
                # Walk back to the start of the existing run.
                forced_letters: List[str] = []
                qr, qc = pr, pc
                while 0 <= qr < BOARD_SIZE and 0 <= qc < BOARD_SIZE and board.at(qr, qc) is not None:
                    forced_letters.append(board.at(qr, qc).letter)
                    qr -= dr
                    qc -= dc
                forced_prefix = "".join(reversed(forced_letters))
                if has_prefix(forced_prefix):
                    _extend_right(
                        board, forced_prefix, ar, ac, rack, [],
                        direction, cross, moves, seen, ar, ac,
                    )
            else:
                # Free left part: bounded by space to the left until next board tile or edge.
                limit = 0
                qr, qc = ar - dr, ac - dc
                while (
                    0 <= qr < BOARD_SIZE
                    and 0 <= qc < BOARD_SIZE
                    and board.at(qr, qc) is None
                ):
                    limit += 1
                    qr -= dr
                    qc -= dc
                max_left = min(limit, len(rack))
                _left_parts(
                    board, ar, ac, rack, direction, cross, moves, seen, max_left,
                )
    return moves


def best_move(board: Board, rack: List[str]) -> Optional[ScoredMove]:
    candidates = generate_moves(board, rack)
    if not candidates:
        return None
    candidates.sort(key=lambda m: m.score, reverse=True)
    return candidates[0]
