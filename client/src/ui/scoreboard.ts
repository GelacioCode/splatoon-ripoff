import type { Objective } from '../game/objective';
import { TEAM_COLORS } from '../render/palette';
import { OrderLine } from './orders';

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** 4:05 */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Top-center match info: pink captures · time left · cyan captures, with your order under it
 * ("ATTACK! Escort your carrier to the enemy base").
 */
export class Scoreboard {
  private readonly root = document.createElement('div');
  private readonly scores: [HTMLSpanElement, HTMLSpanElement];
  private readonly timer = document.createElement('span');
  private readonly order = new OrderLine();
  private shown = '';

  constructor() {
    this.root.className = 'scoreboard';
    this.root.hidden = true;
    const row = document.createElement('div');
    row.className = 'scoreboard-row';
    this.scores = [document.createElement('span'), document.createElement('span')];
    this.scores.forEach((score, team) => {
      score.className = 'scoreboard-score';
      score.style.background = cssColor(TEAM_COLORS[team]);
    });
    this.timer.className = 'scoreboard-timer';
    row.append(this.scores[0], this.timer, this.scores[1]);
    this.root.append(row, this.order.root);
    document.body.append(this.root);
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** `goal`: captures to win, shown under the clock. */
  update(score0: number, score1: number, secondsLeft: number, goal: number): void {
    const key = `${score0}|${score1}|${secondsLeft}|${goal}`;
    if (key === this.shown) return;
    // A score that just went up gets a little bounce.
    const before = [this.scores[0].textContent, this.scores[1].textContent];
    this.shown = key;
    this.scores[0].textContent = String(score0);
    this.scores[1].textContent = String(score1);
    this.scores.forEach((score, team) => {
      if (before[team] !== null && before[team] !== '' && before[team] !== score.textContent) {
        score.classList.remove('bump');
        void score.offsetWidth;
        score.classList.add('bump');
      }
    });
    this.timer.textContent = clock(secondsLeft);
    this.timer.dataset.goal = `first to ${goal}`;
    // The last 30 seconds tick in red.
    this.timer.classList.toggle('urgent', secondsLeft <= 30);
  }

  /** Your order right now, or null for none. */
  setOrder(objective: Objective | null): void {
    this.order.update(objective);
  }

  dispose(): void {
    this.root.remove();
  }
}
