import type { Objective } from '../game/objective';
import { drawObjectiveIcon } from '../render/objectiveIcons';

const ICON_PIXELS = 64;

/**
 * The order under the scoreboard: the objective badge, a big order ("ATTACK!") and a line
 * saying what it means. A new order pops in.
 */
export class OrderLine {
  readonly root = document.createElement('div');
  private readonly icon = document.createElement('canvas');
  private readonly title = document.createElement('div');
  private readonly detail = document.createElement('div');
  private shownIcon = '';
  private shownTitle = '';

  constructor() {
    this.root.className = 'order';
    this.root.hidden = true;
    this.icon.className = 'order-icon';
    this.icon.width = ICON_PIXELS;
    this.icon.height = ICON_PIXELS;
    this.title.className = 'order-title';
    this.detail.className = 'order-detail';
    const text = document.createElement('div');
    text.className = 'order-text';
    text.append(this.title, this.detail);
    this.root.append(this.icon, text);
  }

  /** null hides it (no order right now). */
  update(objective: Objective | null): void {
    this.root.hidden = objective === null;
    if (!objective) {
      this.shownTitle = '';
      return;
    }
    if (objective.icon !== this.shownIcon) {
      this.shownIcon = objective.icon;
      drawObjectiveIcon(this.icon, objective.icon);
    }
    this.root.dataset.icon = objective.icon;
    if (objective.title !== this.shownTitle) {
      this.shownTitle = objective.title;
      this.title.textContent = objective.title;
      this.root.classList.remove('order-new');
      // Restarts the pop-in animation.
      void this.root.offsetWidth;
      this.root.classList.add('order-new');
    }
    if (this.detail.textContent !== objective.detail) this.detail.textContent = objective.detail;
  }
}
