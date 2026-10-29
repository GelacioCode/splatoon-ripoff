import { qrCodePng } from './qrCode';

/** What the invite popup shows. */
export interface InviteInfo {
  code: string;
  link: string;
  /** SVG markup of the join QR code, or null while it's being made. */
  qrSvg: string | null;
}

/** How long a button says "Copied!" before going back to its label (ms). */
const FEEDBACK_MS = 1400;

/**
 * Copies text. The clipboard API needs a secure page (https or localhost); on a plain
 * `http://192.168…` page (phone testing) it falls back to the old copy command.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the old way.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let copied: boolean;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

/** Whether this browser can put a picture on the clipboard (secure pages only). */
function canCopyImage(): boolean {
  return (
    window.isSecureContext &&
    typeof ClipboardItem !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function'
  );
}

/** Saves the QR code as a PNG file. */
async function saveQr(info: InviteInfo): Promise<void> {
  const url = URL.createObjectURL(await qrCodePng(info.link));
  const link = document.createElement('a');
  link.href = url;
  link.download = `paint-rush-${info.code}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The lobby's invite popup: a big QR code, the code and the link, with buttons to copy the
 * code, the link or the QR picture (saved as a file where a picture can't be copied), and the
 * phone's share sheet where there is one. It stays open while the lobby updates.
 */
export class InvitePopup {
  readonly element = document.createElement('div');
  private readonly qr = document.createElement('div');
  private readonly code = document.createElement('p');
  private readonly link = document.createElement('p');
  private info: InviteInfo = { code: '', link: '', qrSvg: null };
  private shownSvg: string | null = null;

  constructor() {
    this.element.className = 'invite-popup';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-label', 'Invite players');
    // A click on the dimmed backdrop (not the card) closes it.
    this.element.addEventListener('click', (event) => {
      if (event.target === this.element) this.close();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.element.hidden) this.close();
    });

    const card = document.createElement('div');
    card.className = 'invite-card';
    const close = this.button('✕', 'invite-close', () => this.close());
    close.setAttribute('aria-label', 'Close');
    const title = document.createElement('h2');
    title.textContent = 'Invite players';
    this.qr.className = 'screen-qr invite-qr';
    this.code.className = 'screen-code invite-code';
    this.link.className = 'screen-join-link';

    const actions = document.createElement('div');
    actions.className = 'invite-actions';
    const copyCode = this.button('📋 Copy code', 'screen-button', () =>
      this.feedback(copyCode, copyText(this.info.code)),
    );
    const copyLink = this.button('🔗 Copy link', 'screen-button', () =>
      this.feedback(copyLink, copyText(this.info.link)),
    );
    const imageLabel = canCopyImage() ? '🖼 Copy QR image' : '🖼 Save QR image';
    const copyImage = this.button(imageLabel, 'screen-button', () =>
      this.feedback(copyImage, this.copyQr(), canCopyImage() ? undefined : '✓ Saved!'),
    );
    actions.append(copyCode, copyLink, copyImage);
    if (typeof navigator.share === 'function') {
      actions.append(this.button('📤 Share', 'screen-button', () => void this.share()));
    }
    card.append(close, title, this.qr, this.code, this.link, actions);
    this.element.append(card);
  }

  /** New lobby details (the popup redraws only what changed). */
  update(info: InviteInfo): void {
    this.info = info;
    this.code.textContent = info.code;
    this.link.textContent = info.link;
    if (info.qrSvg !== this.shownSvg) {
      this.shownSvg = info.qrSvg;
      // Our own SVG (from qrCodeSvg), never anything a player typed.
      this.qr.innerHTML = info.qrSvg ?? '';
    }
  }

  open(): void {
    this.element.hidden = false;
  }

  close(): void {
    this.element.hidden = true;
  }

  private button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = label;
    el.addEventListener('click', onClick);
    return el;
  }

  /** Says "Copied!" (or what went wrong) on the button for a moment. */
  private feedback(button: HTMLButtonElement, work: Promise<boolean>, done = '✓ Copied!'): void {
    const label = button.dataset.label ?? button.textContent ?? '';
    button.dataset.label = label;
    void work.then((ok) => {
      button.textContent = ok ? done : "Couldn't copy";
      button.classList.toggle('done', ok);
      setTimeout(() => {
        button.textContent = label;
        button.classList.remove('done');
      }, FEEDBACK_MS);
    });
  }

  /** Copies the QR picture, or saves it as a file where pictures can't be copied. */
  private async copyQr(): Promise<boolean> {
    try {
      if (canCopyImage()) {
        // The picture is passed as a promise, so Safari still sees it as part of the click.
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': qrCodePng(this.info.link) }),
        ]);
      } else {
        await saveQr(this.info);
      }
      return true;
    } catch (error) {
      console.warn('[invite] copying the QR image failed', error);
      return false;
    }
  }

  private async share(): Promise<void> {
    try {
      await navigator.share({
        title: 'Paint Rush',
        text: `Join my Paint Rush lobby: ${this.info.code}`,
        url: this.info.link,
      });
    } catch {
      // Closing the share sheet without sharing lands here: nothing to do.
    }
  }
}
