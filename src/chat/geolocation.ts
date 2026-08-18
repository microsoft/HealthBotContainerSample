import type { GeoLocation } from '../types';

// Ask the browser for the user's location. Mirrors the geolocation flow from the
// original public/index.js: on denial (or any error) it resolves with no location
// so the caller can proceed without blocking the conversation.
export function getUserLocation(callback: (location?: GeoLocation) => void): void {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      callback({ lat: position.coords.latitude, long: position.coords.longitude });
    },
    (error) => {
      // user declined to share location
      console.log('location error:' + error.message);
      callback();
    },
  );
}
