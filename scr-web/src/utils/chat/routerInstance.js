let router = null;

export function setRouter(routerInstance) {
  router = routerInstance;
}

export function getRouter() {
  return router;
}

export function navigateTo(path) {
  if (router) {
    router.push(path);
  }
}
