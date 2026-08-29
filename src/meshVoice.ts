export const VOICE_NOTE_MAX_SECONDS = 30;
export const VOICE_CHUNK_SIZE = 12_000;
export const VOICE_REASSEMBLY_STALE_MS = 45_000;

export type MeshMessageType = 'text' | 'voice';

export interface VoiceChunkPayload {
  message: Omit<import('./types').MeshChatMessage, 'audioData'>;
  audioChunk: string;
  chunkIndex: number;
  totalChunks: number;
}

export interface VoiceChunkProgress {
  messageId: string;
  receivedChunks: number;
  totalChunks: number;
  updatedAt: number;
  status: 'receiving' | 'stalled';
}

export interface VoiceReassemblyResult {
  message?: import('./types').MeshChatMessage;
  progress: VoiceChunkProgress;
}

interface VoiceChunkBuffer {
  message: Omit<import('./types').MeshChatMessage, 'audioData'>;
  chunks: Map<number, string>;
  totalChunks: number;
  updatedAt: number;
}

export const getPreferredVoiceMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
};

export const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = () => reject(reader.error ?? new Error('Unable to read audio blob.'));
  reader.readAsDataURL(blob);
});

export const base64ToAudioSrc = (base64: string, mimeType = 'audio/webm;codecs=opus') => `data:${mimeType};base64,${base64}`;

export const chunkVoiceMessage = (message: import('./types').MeshChatMessage, chunkSize = VOICE_CHUNK_SIZE): VoiceChunkPayload[] => {
  if (message.type !== 'voice' || !message.audioData) return [];
  const totalChunks = Math.max(1, Math.ceil(message.audioData.length / chunkSize));
  const messageWithoutAudio: Omit<import('./types').MeshChatMessage, 'audioData'> = { ...message };
  delete (messageWithoutAudio as Partial<import('./types').MeshChatMessage>).audioData;
  return Array.from({ length: totalChunks }, (_, chunkIndex) => ({
    message: messageWithoutAudio,
    audioChunk: message.audioData!.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize),
    chunkIndex,
    totalChunks
  }));
};

export class VoiceChunkReassembler {
  private buffers = new Map<string, VoiceChunkBuffer>();

  accept(payload: VoiceChunkPayload, now = Date.now()): VoiceReassemblyResult {
    const id = payload.message.id;
    const existing = this.buffers.get(id) ?? {
      message: payload.message,
      chunks: new Map<number, string>(),
      totalChunks: payload.totalChunks,
      updatedAt: now
    };
    existing.message = payload.message;
    existing.totalChunks = payload.totalChunks;
    existing.updatedAt = now;
    if (payload.chunkIndex >= 0 && payload.chunkIndex < payload.totalChunks && !existing.chunks.has(payload.chunkIndex)) {
      existing.chunks.set(payload.chunkIndex, payload.audioChunk);
    }
    this.buffers.set(id, existing);
    const progress = this.getProgress(id, now)!;
    if (existing.chunks.size === existing.totalChunks) {
      const audioData = Array.from({ length: existing.totalChunks }, (_, index) => existing.chunks.get(index) ?? '').join('');
      this.buffers.delete(id);
      return { message: { ...existing.message, type: 'voice', audioData }, progress };
    }
    return { progress };
  }

  getProgress(messageId: string, now = Date.now()): VoiceChunkProgress | undefined {
    const buffer = this.buffers.get(messageId);
    if (!buffer) return undefined;
    return {
      messageId,
      receivedChunks: buffer.chunks.size,
      totalChunks: buffer.totalChunks,
      updatedAt: buffer.updatedAt,
      status: now - buffer.updatedAt > VOICE_REASSEMBLY_STALE_MS ? 'stalled' : 'receiving'
    };
  }

  getAllProgress(now = Date.now()) {
    return Array.from(this.buffers.keys()).map((id) => this.getProgress(id, now)).filter(Boolean) as VoiceChunkProgress[];
  }
}
