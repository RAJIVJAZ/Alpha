/** Device position as a promise (rejects with a readable message; `denied` when refused). */
export const devicePosition = (denied = 'Allow location access, or pick an area') =>
  new Promise<{ lat: number; lng: number }>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation)
      return reject(new Error('Location is not available on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error(denied)),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
