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
  // The bot streams its progress, so Web Chat's typing dots are redundant.
  streaming?: boolean;
  location?: GeoLocation;
}

export interface User {
  id: string;
  name?: string;
  locale?: string;
}
