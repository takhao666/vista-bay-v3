// Vista Bay — keyboard + mouse input with pointer lock, plus edge-triggered
// "pressed this frame" helpers the game loop consumes.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.locked = false;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.clicked = true; }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    canvas.addEventListener('click', () => {
      if (!this.locked && this.game && this.game.playing && !this.game.paused) {
        this.game.lockPointer();
      }
    });
  }
  attachGame(game) { this.game = game; }
  wasPressed(code) { return !!this.pressed[code]; }
  consumeFrame() {
    this.pressed = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
  }
}
