// Shared wire protocol between server relay and Tauri clients.

export interface MediaInfo {
  url: string;
  mime: string;
  size: number;
  filename: string;
}

export interface HelloMessage {
  type: "hello";
  clientId: string;
  sharedKey: string;
}

export interface AckMessage {
  type: "ack";
  clientId: string;
}

export interface ErrorMessage {
  type: "error";
  reason: string;
}

export interface DisplayMessage {
  type: "display";
  id: string;
  media: MediaInfo;
  text: string | null;
  duration: number;
  from: string;
  channelId: string;
}

export type ClientMessage = HelloMessage;
export type ServerMessage = AckMessage | ErrorMessage | DisplayMessage;
