import 'reflect-metadata';
import { BadRequestException, Body, ConflictException, Controller, Get, HttpException, Injectable, Module, NotFoundException, Param, Post, Query, Req, ServiceUnavailableException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { Action, Board, createBoard, LEVELS, Level, play, points, visible } from './engine';

const pool: Pool = require('../db.cjs')();
pool.on('error', () => console.error('Idle database connection failed'));
function level(value: unknown): Level {
  if (typeof value !== 'string' || !Object.hasOwn(LEVELS, value)) throw new BadRequestException('Nepoznata težina.');
  return value as Level;
}
function cell(value: unknown, difficulty: Level): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= LEVELS[difficulty].rows * LEVELS[difficulty].cols) throw new BadRequestException('Neispravno polje.');
  return value as number;
}
function id(value: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException('Neispravna igra.'); return value; }
function payload(row: any) {
  const elapsedMs = row.elapsed_ms ?? Math.max(0, Date.now() - new Date(row.started_at).getTime());
  return { id: row.id, ...visible(row.board), revision: row.revision, elapsedMs, points: row.board.status === 'won' ? points(row.board.level, elapsedMs) : 0, saved: !!row.saved };
}
@Injectable()
class Games {
  private limits = new Map<string, { count: number; until: number }>();
  rate(req: Request, type: string, max: number) {
    const now = Date.now();
    for (const [key, bucket] of this.limits) if (bucket.until < now) this.limits.delete(key);
    const key = `${type}:${req.ip}`;
    const entry = this.limits.get(key) ?? { count: 0, until: now + 60000 };
    if (++entry.count > max || this.limits.size > 10000) throw new HttpException('Previše zahtjeva. Pričekaj jednu minutu.', 429);
    this.limits.set(key, entry);
  }
  async get(gameId: string) {
    const r = await pool.query('SELECT g.*, EXISTS(SELECT 1 FROM scores s WHERE s.game_id=g.id) AS saved FROM games g WHERE id=$1 AND created_at > now() - interval \'24 hours\'', [id(gameId)]);
    if (!r.rowCount) throw new NotFoundException('Igra je istekla. Pokreni novu.');
    return payload(r.rows[0]);
  }
  async create(body: any) {
    const difficulty = level(body?.level), first = cell(body?.cell, difficulty);
    const board = createBoard(difficulty, first);
    // Bounded, request-driven retention; scores persist independently of game sessions.
    await pool.query("DELETE FROM games WHERE id IN (SELECT id FROM games WHERE created_at < now() - interval '24 hours' LIMIT 100)");
    const r = await pool.query('INSERT INTO games (id, board) VALUES ($1, $2) RETURNING *', [randomUUID(), JSON.stringify(board)]);
    return payload(r.rows[0]);
  }
  async action(gameId: string, body: any) {
    id(gameId);
    if (!['flag', 'reveal', 'chord'].includes(body?.action) || !Number.isInteger(body?.revision)) throw new BadRequestException('Neispravan potez.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query("SELECT * FROM games WHERE id=$1 AND created_at > now() - interval '24 hours' FOR UPDATE", [gameId]);
      if (!r.rowCount) throw new NotFoundException('Igra je istekla.');
      const row = r.rows[0], board: Board = row.board;
      if (body.revision !== row.revision) throw new ConflictException('Igra je promijenjena. Osvježi stanje.');
      if (board.status !== 'playing') throw new ConflictException('Igra je završena.');
      play(board, body.action as Action, cell(body.cell, board.level));
      const updated = await client.query(`UPDATE games SET board=$2, revision=revision+1,
        finished_at=CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,
        elapsed_ms=CASE WHEN $3 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp()-started_at))*1000))::integer ELSE NULL END
        WHERE id=$1 RETURNING *`, [gameId, JSON.stringify(board), board.status !== 'playing']);
      await client.query('COMMIT'); return payload(updated.rows[0]);
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  async save(gameId: string, body: any) {
    id(gameId);
    if (typeof body?.initials !== 'string' || !/^[A-Z0-9]{3}$/.test(body.initials)) throw new BadRequestException('Upiši tri slova ili brojke.');
    const r = await pool.query('SELECT * FROM games WHERE id=$1', [gameId]);
    if (!r.rowCount || r.rows[0].board.status !== 'won') throw new BadRequestException('Spremiti se može samo pobjeda.');
    const game = r.rows[0];
    await pool.query(`INSERT INTO scores (game_id, initials, difficulty, elapsed_ms, points) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (game_id) DO NOTHING`, [gameId, body.initials, game.board.level, game.elapsed_ms, points(game.board.level, game.elapsed_ms)]);
    return { saved: true };
  }
}
@Controller('api')
class Api {
  constructor(private readonly games: Games) {}
  @Get('health') async health() {
    try { await pool.query('SELECT 1 FROM scores LIMIT 1'); return { status: 'ok', database: 'ready' }; }
    catch { throw new ServiceUnavailableException('Baza podataka nije spremna.'); }
  }
  @Get('leaderboard') async leaderboard(@Query('level') value: string) {
    const difficulty = level(value);
    const rows = await pool.query('SELECT initials, elapsed_ms AS "elapsedMs", points, created_at AS "createdAt" FROM scores WHERE difficulty=$1 ORDER BY elapsed_ms ASC, created_at ASC, id ASC LIMIT 10', [difficulty]);
    const totals = await pool.query('SELECT COUNT(*)::integer AS total FROM scores WHERE difficulty=$1', [difficulty]);
    return { entries: rows.rows, total: totals.rows[0].total };
  }
  @Post('games') create(@Body() body: unknown, @Req() req: Request) { this.games.rate(req, 'new', 30); return this.games.create(body); }
  @Get('games/:id') get(@Param('id') gameId: string) { return this.games.get(gameId); }
  @Post('games/:id/actions') action(@Param('id') gameId: string, @Body() body: unknown, @Req() req: Request) { this.games.rate(req, 'move', 600); return this.games.action(gameId, body); }
  @Post('games/:id/score') save(@Param('id') gameId: string, @Body() body: unknown, @Req() req: Request) { this.games.rate(req, 'score', 30); return this.games.save(gameId, body); }
}
@Module({ controllers: [Api], providers: [Games] })
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn', 'log'] });
  const express = require('express');
  app.use(express.json({ limit: '4kb' }));
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use((_req: Request, res: Response, next: NextFunction) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { void pool.end(); });
}
bootstrap().catch(() => { console.error('API startup failed.'); process.exitCode = 1; });
