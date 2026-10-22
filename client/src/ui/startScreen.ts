/** "Click to play" screen, shown whenever the mouse isn't captured (it doubles as the pause screen). */
export function createStartScreen(onStart: () => void) {
  const screen = document.createElement('div');
  screen.className = 'start-screen';
  screen.innerHTML = `
    <div class="start-card">
      <h1>Paint Rush</h1>
      <p class="start-cta">Click to play</p>
      <p class="start-keys">WASD move · Mouse look · Click shoot · Space jump · Esc pause · \` tuning panel</p>
    </div>`;
  screen.addEventListener('click', onStart);
  document.body.appendChild(screen);
  return {
    setVisible(visible: boolean): void {
      screen.hidden = !visible;
    },
  };
}
