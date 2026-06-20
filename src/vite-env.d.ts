/// <reference types="vite/client" />

interface Window {
  orthoVoxelDesktop?: {
    onMenuEvent(callback: (eventName: string) => void): () => void;
  };
}
