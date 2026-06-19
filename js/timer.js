// js/timer.js
export class Timer {
  constructor(workout, timerState) {
    this.workout = workout;
    this.state  = timerState;
    this.interval = null;
  }

  /*  start() is only used during rest countdown; callback fires when rest hits 0  */
  start(callback) {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.state.timeLeft -= 0.1;
      if (this.state.timeLeft <= 0) {
        this.stop();
        if (callback) callback();
      }
    }, 100);
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  adjust(delta) {
    this.state.timeLeft = Math.max(0, this.state.timeLeft + delta);
  }

  skip() {
    this.stop();
    this.state.phase = 'input';
  }
}
