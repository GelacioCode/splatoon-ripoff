/** How long an announcement stays (ms), and how many show at once. */
const SHOW_MS = 3000;
const MAX_SHOWN = 3;

/** Big short messages under the scoreboard: "Sam took the flag!", "Pink team scores!". */
export class Announcer {
  private readonly root = document.createElement('div');

  constructor() {
    this.root.className = 'announcer';
    document.body.append(this.root);
  }

  show(text: string, color = '#ffffff'): void {
    const line = document.createElement('div');
    line.className = 'announce-line';
    line.textContent = text;
    line.style.color = color;
    this.root.append(line);
    while (this.root.children.length > MAX_SHOWN) this.root.firstElementChild?.remove();
    setTimeout(() => line.remove(), SHOW_MS);
  }

  dispose(): void {
    this.root.remove();
  }
}
