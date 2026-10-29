interface HowCard {
  icon: string;
  title: string;
  lines: string[];
}

function cards(touchDevice: boolean): HowCard[] {
  return [
    {
      icon: '🎯',
      title: 'The goal',
      lines: [
        'Two teams paint the arena and fight over the objective.',
        'Win a round to score a point. First to the round goal wins the match.',
        'Time up? Most rounds wins, then most paint.',
      ],
    },
    {
      icon: '🫧',
      title: 'Paint & swim',
      lines: [
        'Shoot to paint. Hold swim to melt into a puddle.',
        'In your own paint you swim fast, hide, refill ink and climb painted walls.',
        'Enemy paint slows you and hurts. Plain floor is normal speed.',
      ],
    },
    {
      icon: '⚑',
      title: 'Capture the Flag',
      lines: [
        'Grab the flag in the middle and run it into the ENEMY base.',
        "Carriers can't swim and move slower, so teammates escort and paint a path.",
        'Splat the carrier to drop the flag. Defend your spawn when they have it!',
      ],
    },
    {
      icon: '👑',
      title: 'King of the Hill',
      lines: [
        'Stand in the glowing circle to push the bar into their side.',
        'Both teams in it? Contested: the bar stops. Push them out!',
        'A full push (a net minute of holding) wins the round.',
      ],
    },
    {
      icon: '💚',
      title: 'Health & ink',
      lines: [
        'You have 100 HP. Health only comes back after 5 s calm (no hits, no shooting)…',
        '…or right away while swimming in your own paint. Reloads are faster then too.',
        'Splat several in a row for a DOUBLE, TRIPLE, QUADRA or PENTA KILL!',
      ],
    },
    {
      icon: '🧑‍🎨',
      title: 'Roles',
      lines: [
        'Sniper: long range, a 4× scope. 2 hits splat.',
        'Assault: all-rounder, 2× zoom. 3 hits splat.',
        'Machine gun: close range spray, light zoom. 3 hits splat.',
      ],
    },
    {
      icon: touchDevice ? '👆' : '⌨️',
      title: 'Controls',
      lines: touchDevice
        ? [
            'Left thumb: move. Right thumb: drag to aim (drag SHOOT to aim too).',
            'AIM zooms · SWIM melts · JUMP · R reloads · II pauses.',
            '💣 takes out a bomb: SHOOT throws it (it pops after 3 s). Crates refill bombs.',
          ]
        : [
            'WASD move · Mouse aim · Click shoot · Right-click zoom/scope.',
            'Shift swim · Space jump · R reload · Tab scores · M map · Esc pause.',
            '2 bomb, then click to throw (it pops after 3 s) · 1 back to your weapon. Crates refill bombs.',
          ],
    },
  ];
}

/**
 * How to play: short swipeable cards (goal, paint and swim, each mode, health, roles,
 * controls) with arrows and dots, so it never turns into a wall of text.
 */
export function createHowToPlay(touchDevice: boolean): HTMLElement {
  const list = cards(touchDevice);
  const root = document.createElement('div');
  root.className = 'how';
  const card = document.createElement('div');
  card.className = 'how-card';
  const dots = document.createElement('div');
  dots.className = 'how-dots';
  const prev = document.createElement('button');
  const next = document.createElement('button');
  prev.type = 'button';
  next.type = 'button';
  prev.className = 'how-arrow';
  next.className = 'how-arrow';
  prev.textContent = '◀';
  next.textContent = '▶';
  prev.setAttribute('aria-label', 'Previous');
  next.setAttribute('aria-label', 'Next');
  let index = 0;

  const show = (i: number) => {
    index = (i + list.length) % list.length;
    const c = list[index];
    const icon = document.createElement('div');
    icon.className = 'how-icon';
    icon.textContent = c.icon;
    const title = document.createElement('h2');
    title.textContent = c.title;
    const lines = document.createElement('ul');
    for (const line of c.lines) {
      const li = document.createElement('li');
      li.textContent = line;
      lines.append(li);
    }
    card.replaceChildren(icon, title, lines);
    card.classList.remove('flip');
    void card.offsetWidth;
    card.classList.add('flip');
    dots.replaceChildren(
      ...list.map((_, d) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `how-dot${d === index ? ' on' : ''}`;
        dot.setAttribute('aria-label', list[d].title);
        dot.addEventListener('click', () => show(d));
        return dot;
      }),
    );
  };
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));

  // Swipe on phones.
  let startX: number | null = null;
  card.addEventListener('pointerdown', (event) => {
    startX = event.clientX;
  });
  card.addEventListener('pointerup', (event) => {
    if (startX === null) return;
    const dx = event.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1));
  });

  const row = document.createElement('div');
  row.className = 'how-row';
  row.append(prev, card, next);
  root.append(row, dots);
  show(0);
  return root;
}
