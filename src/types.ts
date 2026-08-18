// Shared types for the React Web Chat client.

export interface GeoLocation {
  lat: number;
  long: number;
}

// Shape of the JWT payload minted by the Express backend (`server.js` -> jwt.sign).
export interface TokenPayload {
  userId: string;
  userName?: string;
  locale?: string;
  connectorToken: string;
  directLineURI?: string;
  location?: GeoLocation;
}

export interface User {
  id: string;
  name?: string;
  locale?: string;
}
