import { fetchJSON } from './apiService';

export interface CounterChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface CounterargumentResponse {
  reply: string;
}

export const generateCounter = async (
  context: string,
  messages: CounterChatMessage[],
  mode: 'initial' | 'followup',
): Promise<CounterargumentResponse> => {
  return fetchJSON<CounterargumentResponse>('/api/counter/counter', {
    method: 'POST',
    body: JSON.stringify({ context, messages, mode }),
  });
};
