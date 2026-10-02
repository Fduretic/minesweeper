import { bootstrapApplication } from '@angular/platform-browser';
import { Component, signal, computed, OnDestroy, OnInit, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Level = 'beginner' | 'intermediate' | 'expert';
type Cell = number | 'hidden' | 'flag' | 'mine' | 'wrong';
interface Game { id: string; level: Level; rows: number; cols: number; mineCount: number; status: 'playing' | 'won' | 'lost'; exploded: number | null; cells: Cell[]; elapsedMs: number; revision: number; points: number; revealedCount: number; saved: boolean; }
interface Entry { initials: string; elapsedMs: number; points: number; }
const CONFIG = { beginner: { rows: 9, cols: 9, mines: 10, name: 'Početnik', base: 10000 }, intermediate: { rows: 16, cols: 16, mines: 40, name: 'Znalac', base: 25000 }, expert: { rows: 16, cols: 30, mines: 99, name: 'Ekspert', base: 50000 } };

@Component({ selector: 'app-root', standalone: true, imports: [FormsModule], templateUrl: './app.html' })
export class App implements OnInit, OnDestroy {
  @ViewChild('modal') modal?: ElementRef<HTMLDialogElement>;
  levels: Level[] = ['beginner', 'intermediate', 'expert']; config = CONFIG;
  difficulty = signal<Level>('beginner'); game = signal<Game | null>(null); busy = signal(false);
  error = signal(''); mode = signal<'reveal' | 'flag'>('reveal'); sound = signal(false);
  elapsed = signal(0); entries = signal<Entry[]>([]); total = signal(0); loadingScores = signal(true); scoreError = signal(false);
  dialog = signal<'help' | 'reset' | 'win' | null>(null); pendingLevel: Level | null = null;
  initials = ''; saving = signal(false); saveError = signal(''); saved = signal(false); focusIndex = signal(0);
  settings = computed(() => CONFIG[this.difficulty()]);
  cells = computed<Cell[]>(() => this.game()?.cells ?? Array(this.settings().rows * this.settings().cols).fill('hidden'));
  remaining = computed(() => this.settings().mines - this.cells().filter(c => c === 'flag').length);
  progress = computed(() => Math.round((this.game()?.revealedCount ?? 0) / (this.settings().rows * this.settings().cols - this.settings().mines) * 100));
  state = computed(() => this.game()?.status ?? 'ready');
  private baseTime = 0; private receivedAt = 0; private audio?: AudioContext;
  private timer = window.setInterval(() => { if (this.state() === 'playing') this.elapsed.set(this.baseTime + performance.now() - this.receivedAt); }, 200);
  private scoresRequest = 0; private longPress?: number; private longPressed = false;
  async ngOnInit() {
    try { this.sound.set(localStorage.getItem('arcade-sound') === 'true'); this.initials = localStorage.getItem('arcade-initials') ?? ''; } catch {}
    try {
      const stored = sessionStorage.getItem('arcade-game');
      if (stored) { this.busy.set(true); const g = await this.request<Game>('/games/' + stored); this.difficulty.set(g.level); this.accept(g); }
    } catch { this.error.set('Prethodna igra nije dostupna. Možeš započeti novu.'); }
    finally { this.busy.set(false); }
    await this.loadScores();
  }
  ngOnDestroy() { clearInterval(this.timer); this.cancelPress(); void this.audio?.close(); }
  async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch('/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) }).catch(() => { throw new Error('Veza s igrom je prekinuta. Provjeri internet i pokušaj ponovno.'); });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(typeof data.message === 'string' ? data.message : 'Poslužitelj nije dostupan. Pokušaj ponovno.'); }
    return response.json();
  }
  accept(g: Game) {
    this.game.set(g); this.baseTime = g.elapsedMs; this.receivedAt = performance.now(); this.elapsed.set(g.elapsedMs); this.saved.set(g.saved);
    try { sessionStorage.setItem('arcade-game', g.id); } catch {}
  }
  async move(index: number, action: 'reveal' | 'flag' | 'chord' = this.mode()) {
    if (this.busy() || this.state() === 'lost' || this.state() === 'won') return;
    if (!this.game() && action === 'flag') { this.error.set('Prvo otvori jedno polje. Prvi potez je siguran!'); return; }
    this.busy.set(true); this.error.set('');
    const old = this.game();
    try {
      const g = old ? await this.request<Game>(`/games/${old.id}/actions`, { action, cell: index, revision: old.revision }) : await this.request<Game>('/games', { level: this.difficulty(), cell: index });
      this.accept(g); this.beep(g.status === 'lost' ? 'lose' : g.status === 'won' ? 'win' : action === 'flag' ? 'flag' : 'tap');
      if (g.status === 'won') { this.openDialog('win'); }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Veza je prekinuta. Pokušaj ponovno.');
      if (old) { try { const g = await this.request<Game>('/games/' + old.id); this.accept(g); if (g.status === 'won') this.openDialog('win'); } catch {} }
    } finally { this.busy.set(false); }
  }
  clickCell(index: number) {
    if (this.longPressed) { this.longPressed = false; return; }
    void this.move(index, typeof this.cells()[index] === 'number' ? 'chord' : this.mode());
  }
  flag(event: Event, index: number) { event.preventDefault(); this.cancelPress(); if (!this.longPressed) void this.move(index, 'flag'); }
  pointerDown(event: PointerEvent, index: number) {
    this.longPressed = false;
    if (event.pointerType !== 'touch') return;
    this.longPress = window.setTimeout(() => { this.longPressed = true; void this.move(index, 'flag'); }, 450);
  }
  cancelPress() { clearTimeout(this.longPress); }
  keyCell(event: KeyboardEvent, index: number) {
    const cols = this.settings().cols; let next = index;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); void this.move(index, 'flag'); return; }
    if (event.key === 'ArrowRight') next = Math.min(this.cells().length - 1, index + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'ArrowDown') next = Math.min(this.cells().length - 1, index + cols);
    else if (event.key === 'ArrowUp') next = Math.max(0, index - cols);
    else if (event.key === 'Home') next = Math.floor(index / cols) * cols;
    else if (event.key === 'End') next = Math.floor(index / cols) * cols + cols - 1;
    else return;
    event.preventDefault(); this.focusIndex.set(next); document.getElementById('cell-' + next)?.focus();
  }
  label(c: Cell, i: number) { return `Red ${Math.floor(i / this.settings().cols) + 1}, stupac ${i % this.settings().cols + 1}: ${c === 'hidden' ? 'zatvoreno' : c === 'flag' ? 'zastavica' : c === 'mine' ? 'mina' : c === 'wrong' ? 'pogrešna zastavica' : c === 0 ? 'prazno' : c + ' susjednih mina'}`; }
  newGame(level: Level = this.difficulty()) {
    if (this.busy()) return;
    if (this.state() === 'playing' || (this.state() === 'won' && !this.saved())) { this.pendingLevel = level; this.openDialog('reset'); return; }
    this.reset(level);
  }
  reset(level: Level = this.pendingLevel ?? this.difficulty()) {
    this.closeDialog(); this.difficulty.set(level); this.game.set(null); this.elapsed.set(0); this.error.set(''); this.mode.set('reveal'); this.saved.set(false); this.saveError.set(''); this.focusIndex.set(0); this.pendingLevel = null;
    try { sessionStorage.removeItem('arcade-game'); } catch {}
    void this.loadScores();
  }
  async loadScores() {
    const request = ++this.scoresRequest; this.loadingScores.set(true); this.scoreError.set(false);
    try { const result = await this.request<{ entries: Entry[]; total: number }>('/leaderboard?level=' + this.difficulty()); if (request === this.scoresRequest) { this.entries.set(result.entries); this.total.set(result.total); } }
    catch { if (request === this.scoresRequest) this.scoreError.set(true); }
    finally { if (request === this.scoresRequest) this.loadingScores.set(false); }
  }
  async saveScore() {
    if (this.saving() || !this.game()) return;
    this.initials = this.initials.toUpperCase().trim();
    if (!/^[A-Z0-9]{3}$/.test(this.initials)) { this.saveError.set('Upiši točno 3 slova (A–Z) ili brojke.'); return; }
    this.saving.set(true); this.saveError.set('');
    try { await this.request(`/games/${this.game()!.id}/score`, { initials: this.initials }); this.saved.set(true); try { localStorage.setItem('arcade-initials', this.initials); } catch {} await this.loadScores(); }
    catch (e) { this.saveError.set(e instanceof Error ? e.message : 'Spremanje nije uspjelo. Pokušaj ponovno.'); }
    finally { this.saving.set(false); }
  }
  openDialog(value: 'help' | 'reset' | 'win') { this.dialog.set(value); this.modal?.nativeElement.showModal(); }
  backdropClick(event: MouseEvent): void { if (event.target === event.currentTarget) this.closeDialog(); }
  closeDialog() { this.modal?.nativeElement.close(); this.dialog.set(null); }
  toggleSound() { this.sound.update(s => !s); try { localStorage.setItem('arcade-sound', String(this.sound())); } catch {} this.beep('flag'); }
  beep(type: 'tap' | 'flag' | 'win' | 'lose') {
    if (!this.sound()) return;
    try {
      this.audio ??= new AudioContext(); void this.audio.resume();
      const notes = type === 'win' ? [523, 659, 784, 1046] : type === 'lose' ? [196, 147, 98] : type === 'flag' ? [660, 880] : [440];
      notes.forEach((frequency, i) => { const osc = this.audio!.createOscillator(), gain = this.audio!.createGain(), start = this.audio!.currentTime + i * .11; osc.type = 'square'; osc.frequency.value = frequency; gain.gain.setValueAtTime(.035, start); gain.gain.exponentialRampToValueAtTime(.001, start + .1); osc.connect(gain); gain.connect(this.audio!.destination); osc.start(start); osc.stop(start + .12); });
    } catch {}
  }
  clock(ms: number, precise = false) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}${precise ? '.' + Math.floor(ms % 1000 / 100) : ''}`; }
  number(value: number) { return new Intl.NumberFormat('hr-HR').format(value); }
}
bootstrapApplication(App).catch(console.error);
