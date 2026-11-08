import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ParagraphSegment, SpeechPosition, VoiceOption } from '../types';
import { getNextPosition, getPreviousPosition, getSentenceByPosition } from '../services/textChunker';
import { getResumePosition, setResumePosition } from '../services/resumeStore';

const makeVoiceId = (voice: SpeechSynthesisVoice, index: number) =>
  voice.voiceURI || `${voice.lang}-${voice.name}-${index}`;

export type ReadAloudController = {
  isSupported: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  voices: VoiceOption[];
  selectedVoiceId: string | null;
  rate: number;
  currentPosition: SpeechPosition;
  status: string;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  jumpTo: (position: SpeechPosition, autoPlay?: boolean) => void;
  setRate: (rate: number) => void;
  setSelectedVoiceId: (voiceId: string) => void;
};

export const useReadAloud = (bookId: string, paragraphs: ParagraphSegment[]): ReadAloudController => {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const synth = isSupported ? window.speechSynthesis : null;

  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [currentPosition, setCurrentPosition] = useState<SpeechPosition>({ paragraphIndex: 0, sentenceIndex: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const isPlayingRef = useRef(isPlaying);
  const isPausedRef = useRef(isPaused);
  const currentPositionRef = useRef(currentPosition);
  const autoContinueRef = useRef(false);
  const selectedVoiceRef = useRef<VoiceOption | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  useEffect(() => {
    currentPositionRef.current = currentPosition;
    setResumePosition(bookId, currentPosition);
  }, [bookId, currentPosition]);

  const status = useMemo(() => {
    if (!isSupported) return 'Speech synthesis not supported in this browser.';
    if (isPlaying && isPaused) return 'Paused.';
    if (isPlaying) return 'Reading aloud.';
    return 'Ready to read.';
  }, [isSupported, isPlaying, isPaused]);

  useEffect(() => {
    if (!isSupported || !synth) return undefined;

    const loadVoices = () => {
      const available = synth.getVoices();
      const mapped = available.map((voice, index) => ({
        id: makeVoiceId(voice, index),
        name: voice.name,
        lang: voice.lang,
        isDefault: voice.default,
        voice,
      }));
      setVoices(mapped);
      if (!selectedVoiceId && mapped.length > 0) {
        const defaultVoice = mapped.find((item) => item.isDefault) || mapped[0];
        setSelectedVoiceId(defaultVoice.id);
      }
    };

    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => {
      synth.removeEventListener('voiceschanged', loadVoices);
    };
  }, [isSupported, synth, selectedVoiceId]);

  useEffect(() => {
    selectedVoiceRef.current = voices.find((voice) => voice.id === selectedVoiceId) || null;
  }, [voices, selectedVoiceId]);

  useEffect(() => {
    if (!paragraphs.length) return;
    const stored = getResumePosition(bookId);
    if (stored && getSentenceByPosition(paragraphs, stored.paragraphIndex, stored.sentenceIndex)) {
      setCurrentPosition(stored);
      return;
    }
    setCurrentPosition({ paragraphIndex: 0, sentenceIndex: 0 });
  }, [bookId, paragraphs]);

  useEffect(() => {
    if (!synth) return;
    synth.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    autoContinueRef.current = false;
  }, [bookId, paragraphs, synth]);

  useEffect(() => {
    return () => { synth?.cancel(); };
  }, [synth]);

  const speakAt = useCallback(
    (position: SpeechPosition) => {
      if (!synth) return;
      const sentence = getSentenceByPosition(paragraphs, position.paragraphIndex, position.sentenceIndex);
      if (!sentence) {
        setIsPlaying(false);
        setIsPaused(false);
        autoContinueRef.current = false;
        return;
      }

      const utterance = new SpeechSynthesisUtterance(sentence.text);
      utterance.rate = rate;
      if (selectedVoiceRef.current?.voice) utterance.voice = selectedVoiceRef.current.voice;

      utterance.onstart = () => {
        setIsPlaying(true);
        setIsPaused(false);
        setCurrentPosition(position);
      };

      utterance.onend = () => {
        if (!autoContinueRef.current) {
          setIsPlaying(false);
          return;
        }
        const next = getNextPosition(paragraphs, position.paragraphIndex, position.sentenceIndex);
        if (!next) {
          setIsPlaying(false);
          autoContinueRef.current = false;
          return;
        }
        speakAt(next);
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setIsPaused(false);
        autoContinueRef.current = false;
      };

      utteranceRef.current = utterance;
      synth.cancel();
      synth.speak(utterance);
    },
    [paragraphs, rate, synth]
  );

  const play = useCallback(() => {
    if (!synth) return;
    autoContinueRef.current = true;
    speakAt(currentPositionRef.current);
  }, [synth, speakAt]);

  const pause = useCallback(() => {
    if (!synth) return;
    if (synth.speaking && !synth.paused) {
      synth.pause();
      setIsPaused(true);
    }
  }, [synth]);

  const resume = useCallback(() => {
    if (!synth) return;
    if (synth.paused) {
      synth.resume();
      setIsPaused(false);
      setIsPlaying(true);
      autoContinueRef.current = true;
      return;
    }
    play();
  }, [synth, play]);

  const stop = useCallback(() => {
    if (!synth) return;
    autoContinueRef.current = false;
    synth.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  }, [synth]);

  const jumpTo = useCallback(
    (position: SpeechPosition, autoPlay = false) => {
      setCurrentPosition(position);
      if (autoPlay) {
        autoContinueRef.current = true;
        speakAt(position);
      } else {
        autoContinueRef.current = false;
        synth?.cancel();
      }
    },
    [synth, speakAt]
  );

  const next = useCallback(() => {
    const nextPosition = getNextPosition(
      paragraphs,
      currentPositionRef.current.paragraphIndex,
      currentPositionRef.current.sentenceIndex
    );
    if (!nextPosition) return;
    const shouldAutoPlay = isPlayingRef.current && !isPausedRef.current;
    jumpTo(nextPosition, shouldAutoPlay);
  }, [paragraphs, jumpTo]);

  const previous = useCallback(() => {
    const prevPosition = getPreviousPosition(
      paragraphs,
      currentPositionRef.current.paragraphIndex,
      currentPositionRef.current.sentenceIndex
    );
    if (!prevPosition) return;
    const shouldAutoPlay = isPlayingRef.current && !isPausedRef.current;
    jumpTo(prevPosition, shouldAutoPlay);
  }, [paragraphs, jumpTo]);

  const updateRate = useCallback(
    (value: number) => {
      setRate(value);
      if (isPlayingRef.current && !isPausedRef.current) {
        autoContinueRef.current = true;
        speakAt(currentPositionRef.current);
      }
    },
    [speakAt]
  );

  const updateVoice = useCallback(
    (voiceId: string) => {
      setSelectedVoiceId(voiceId);
      if (isPlayingRef.current && !isPausedRef.current) {
        autoContinueRef.current = true;
        speakAt(currentPositionRef.current);
      }
    },
    [speakAt]
  );

  return {
    isSupported,
    isPlaying,
    isPaused,
    voices,
    selectedVoiceId,
    rate,
    currentPosition,
    status,
    play,
    pause,
    resume,
    stop,
    next,
    previous,
    jumpTo,
    setRate: updateRate,
    setSelectedVoiceId: updateVoice,
  };
};
