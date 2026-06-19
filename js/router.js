// js/router.js
export class Router {
  constructor() {
    this.routes = {};
  }

  on(path, handler) {
    this.routes[path] = handler;
  }

  init() {
    window.addEventListener('hashchange', () => this.navigate());
    this.navigate();
  }

  navigate() {
    const hash = window.location.hash.slice(1) || '/';
    const handler = this.routes[hash] || this.routes['/'];
    if (handler) handler();
  }
}
