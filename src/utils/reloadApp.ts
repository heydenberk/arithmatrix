/**
 * Reloading the app from inside the app.
 *
 * The mobile layout is scroll-locked (see index.css) so there is no
 * pull-to-refresh, and once installed the PWA has no browser chrome either - a
 * player with a wedged board or an old build has no way back to a fresh page.
 * This is that way.
 *
 * A plain location.reload() would just be answered by the existing service
 * worker out of its precache, so ask the worker to look for a new version
 * first. It is registered with skipWaiting, so a newer one activates straight
 * away and the reload lands on the new build.
 */
export const reloadApp = async (): Promise<void> => {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      /*
       * Bounded: update() goes to the network, and on a flaky connection an
       * unbounded wait would leave the player tapping a menu item that appears
       * to do nothing. Reloading with the old worker still beats not reloading.
       */
      await Promise.race([
        registration.update(),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ]);
    }
  } catch {
    // A failed update check is no reason to refuse the reload
  }
  window.location.reload();
};
