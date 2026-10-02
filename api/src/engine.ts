import { randomInt } from 'node:crypto';

export const LEVELS = {
  beginner: { rows: 9, cols: 9, mines: 10, base: 10000 },
  intermediate: { rows: 16, cols: 16, mines: 40, base: 25000 },
  expert: { rows: 16, cols: 30, mines: 99, base: 50000 },
} as const;
export type Level = keyof typeof LEVELS;
export type Action = 'reveal' | 'flag' | 'chord';
export interface Board {
  level: Level; mines: number[]; revealed: number[]; flags: number[];
  status: 'playing' | 'won' | 'lost'; exploded: number | null;
}
export function neighbors(index: number, rows: number, cols: number): number[] {
  const r = Math.floor(index / cols), c = index % cols, result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if ((dr || dc) && r + dr >= 0 && r + dr < rows && c + dc >= 0 && c + dc < cols) result.push((r + dr) * cols + c + dc);
  }
  return result;
}
export function createBoard(level: Level, first: number): Board {
  const { rows, cols, mines } = LEVELS[level];
  const safe = new Set([first, ...neighbors(first, rows, cols)]);
  const pool = Array.from({ length: rows * cols }, (_, i) => i).filter(i => !safe.has(i));
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const board: Board = { level, mines: pool.slice(0, mines), revealed: [], flags: [], status: 'playing', exploded: null };
  play(board, 'reveal', first);
  return board;
}
export function count(board: Board, index: number) {
  const { rows, cols } = LEVELS[board.level];
  return neighbors(index, rows, cols).filter(i => board.mines.includes(i)).length;
}
export function play(board: Board, action: Action, index: number): void {
  if (board.status !== 'playing') return;
  const { rows, cols, mines } = LEVELS[board.level];
  if (!Number.isInteger(index) || index < 0 || index >= rows * cols) throw new Error('Invalid cell');
  if (action === 'flag') {
    if (board.revealed.includes(index)) return;
    if (board.flags.includes(index)) board.flags = board.flags.filter(i => i !== index);
    else if (board.flags.length < mines) board.flags.push(index);
    return;
  }
  let pending = [index];
  if (action === 'chord') {
    if (!board.revealed.includes(index)) return;
    const around = neighbors(index, rows, cols);
    if (around.filter(i => board.flags.includes(i)).length !== count(board, index)) return;
    pending = around;
  }
  const seen = new Set(board.revealed), flags = new Set(board.flags), bombs = new Set(board.mines);
  while (pending.length) {
    const cell = pending.pop()!;
    if (seen.has(cell) || flags.has(cell)) continue;
    if (bombs.has(cell)) { board.status = 'lost'; board.exploded = cell; break; }
    seen.add(cell);
    if (!count(board, cell)) pending.push(...neighbors(cell, rows, cols));
  }
  board.revealed = [...seen];
  if (board.status === 'playing' && seen.size === rows * cols - mines) { board.status = 'won'; board.flags = [...board.mines]; }
}
export function points(level: Level, elapsedMs: number): number {
  return Math.max(1, LEVELS[level].base - Math.floor(elapsedMs / 1000) * 10);
}
export function visible(board: Board) {
  const { rows, cols, mines } = LEVELS[board.level];
  return { level: board.level, rows, cols, mineCount: mines, status: board.status, exploded: board.exploded,
    revealedCount: board.revealed.length,
    cells: Array.from({ length: rows * cols }, (_, i) => {
      if (board.status !== 'playing' && board.mines.includes(i)) return board.flags.includes(i) ? 'flag' : 'mine';
      if (board.flags.includes(i)) return board.status === 'lost' ? 'wrong' : 'flag';
      return board.revealed.includes(i) ? count(board, i) : 'hidden';
    }) };
}
