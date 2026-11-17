// Keyboard and mouse state, gathered in one place so the world never touches the
// DOM. Movement keys (arrows and WASD) are exposed as one axis pair; the mouse
// gives an aim point in arena coordinates and a fire button.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.pressedOnce = new Set(); // key codes that went down since the last frame read

    window.addEventListener('keydown', (event) => {
      if (!event.repeat) this.pressedOnce.add(event.code);
      this.keys.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (event) => {
      const point = this.toArenaPoint(event);
      this.mouseX = point.x;
      this.mouseY = point.y;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        this.mouseDown = true;
        this.clicked = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouseDown = false;
    });
    this.clicked = false;
  }

  /** Convert a mouse event to arena coordinates, undoing the canvas CSS scaling. */
  toArenaPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  /** Movement axis: x and y each in {-1, 0, 1}. */
  axis() {
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const up = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const down = this.keys.has('KeyS') || this.keys.has('ArrowDown');
    return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
  }

  /** True while the player wants to fire: mouse held, or Space held. */
  firing() {
    return this.mouseDown || this.keys.has('Space');
  }

  /** True once per physical press of the given code; consumed by reading. */
  wasPressed(code) {
    if (!this.pressedOnce.has(code)) return false;
    this.pressedOnce.delete(code);
    return true;
  }

  /** Consume and report a mouse click since the last frame. */
  takeClick() {
    const was = this.clicked;
    this.clicked = false;
    return was;
  }
}
