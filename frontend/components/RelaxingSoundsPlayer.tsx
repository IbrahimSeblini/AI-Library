import React, { useState, useEffect, useRef } from 'react';
import { MusicIcon } from './icons/MusicIcon';
import { XIcon } from './icons/XIcon';

// Playlist of relaxing sounds
// Audio files are in: frontend/public/audio/
const RELAXING_SOUNDS = [
    {
        id: 1,
        name: 'Calming Rain',
        url: '/audio/calming-rain-257596.mp3',
    },
    {
        id: 2,
        name: 'Tokyo Cafe',
        url: '/audio/tvari-tokyo-cafe-159065.mp3',
    },
];

const RelaxingSoundsPlayer: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [playlist, setPlaylist] = useState(RELAXING_SOUNDS);
    const [isShuffleMode, setIsShuffleMode] = useState(false); // Shuffle button state
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentTrackIndexRef = useRef(currentTrackIndex);
    const playlistRef = useRef(playlist);

    // Keep refs in sync with state
    useEffect(() => {
        currentTrackIndexRef.current = currentTrackIndex;
        playlistRef.current = playlist;
    }, [currentTrackIndex, playlist]);

    // Automatically shuffle to next track when current ends
    const handleAutoNext = () => {
        const currentPlaylist = playlistRef.current;
        const currentIndex = currentTrackIndexRef.current;
        
        if (currentPlaylist.length <= 1) return;
        
        // Get a random track that's different from the current one
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * currentPlaylist.length);
        } while (nextIndex === currentIndex && currentPlaylist.length > 1);
        
        setCurrentTrackIndex(nextIndex);
        // Audio will auto-play due to the useEffect watching currentTrackIndex and isPlaying
    };

    // Initialize audio element
    useEffect(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.loop = false; // Don't loop - shuffle to next track instead
            audioRef.current.volume = 0.5;

            audioRef.current.addEventListener('ended', () => {
                // When track ends, automatically shuffle to next track
                handleAutoNext();
            });

            audioRef.current.addEventListener('error', (e) => {
                console.error('Audio error:', e);
                setIsPlaying(false);
            });
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Update audio source when track changes
    useEffect(() => {
        if (audioRef.current && playlist[currentTrackIndex]) {
            // Stop current playback before loading new source
            audioRef.current.pause();
            audioRef.current.src = '';
            audioRef.current.load();
            
            // Set new source
            audioRef.current.src = playlist[currentTrackIndex].url;
            audioRef.current.load(); // Load the new source
            
            if (isPlaying) {
                // Small delay to ensure source is loaded
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch((err) => {
                        // Ignore AbortError (happens when switching tracks quickly)
                        if (err.name !== 'AbortError') {
                            console.error('Error playing audio:', err);
                            setIsPlaying(false);
                        }
                    });
                }
            }
        }
    }, [currentTrackIndex, playlist, isPlaying]);

    const handlePlayPause = async () => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            try {
                await audioRef.current.play();
                setIsPlaying(true);
            } catch (error) {
                console.error('Error playing audio:', error);
            }
        }
    };


    const handleShuffle = () => {
        // Toggle shuffle mode
        setIsShuffleMode(!isShuffleMode);
        
        // If shuffle is enabled, immediately shuffle to a different track
        if (!isShuffleMode && playlist.length > 1) {
            let nextIndex;
            do {
                nextIndex = Math.floor(Math.random() * playlist.length);
            } while (nextIndex === currentTrackIndex && playlist.length > 1);
            
            setCurrentTrackIndex(nextIndex);
            // If playing, restart with new track
            if (isPlaying && audioRef.current) {
                audioRef.current.load();
                audioRef.current.play().catch((err) => {
                    console.error('Error playing audio:', err);
                });
            }
        }
    };

    const handleNext = () => {
        if (isShuffleMode) {
            // In shuffle mode, pick random track
            handleAutoNext();
        } else {
            // In normal mode, go to next track in order
            const nextIndex = (currentTrackIndex + 1) % playlist.length;
            setCurrentTrackIndex(nextIndex);
        }
    };

    const handlePrevious = () => {
        const prevIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        setCurrentTrackIndex(prevIndex);
    };

    const handleTrackSelect = (index: number) => {
        setCurrentTrackIndex(index);
        if (isPlaying && audioRef.current) {
            audioRef.current.load();
            audioRef.current.play().catch((err) => {
                console.error('Error playing audio:', err);
            });
        }
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (audioRef.current) {
            audioRef.current.volume = parseFloat(e.target.value);
        }
    };

    const currentTrack = playlist[currentTrackIndex];

    return (
        <>
            {/* Floating button to open player */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-40 flex items-center justify-center rounded-full bg-[var(--primary)] p-4 text-[var(--primary-contrast)] shadow-lg transition-all duration-200 hover:scale-110 hover:bg-[var(--primary-hover)]"
                    aria-label="Open relaxing sounds player"
                >
                    <MusicIcon className="w-6 h-6" />
                </button>
            )}

            {/* Player panel */}
            {isOpen && (
                <div className="fixed bottom-6 right-6 z-40 w-80 rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 p-4 shadow-2xl backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-2">
                            <MusicIcon className="w-5 h-5 text-[var(--primary)]" />
                            <h3 className="text-lg font-semibold text-[var(--text)]">Relaxing Sounds</h3>
                        </div>
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                if (audioRef.current) {
                                    audioRef.current.pause();
                                    setIsPlaying(false);
                                }
                            }}
                            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                            aria-label="Close player"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Current track info */}
                    <div className="mb-4">
                        <p className="text-sm text-[var(--text-muted)] mb-1">Now Playing:</p>
                        <p className="text-base font-medium text-[var(--text)]">{currentTrack?.name || 'No track'}</p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center space-x-3 mb-4">
                        <button
                            onClick={handlePrevious}
                            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors p-2"
                            aria-label="Previous track"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953l7.108-4.062A1.125 1.125 0 0121 8.688v8.123zM11.25 16.811c0 .864-.933 1.405-1.683.977l-7.108-4.062a1.125 1.125 0 010-1.953L9.567 8.71a1.125 1.125 0 011.683.977v8.123z" />
                            </svg>
                        </button>
                        <button
                            onClick={handlePlayPause}
                            className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[var(--primary-contrast)] p-3 rounded-full transition-colors flex items-center justify-center"
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={handleNext}
                            className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors p-2"
                            aria-label="Next track"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062A1.125 1.125 0 013 16.81V8.688zM12.75 8.688c0-.864.933-1.405 1.683-.977l7.108 4.062a1.125 1.125 0 010 1.953l-7.108 4.062a1.125 1.125 0 01-1.683-.977V8.688z" />
                            </svg>
                        </button>
                        <button
                            onClick={handleShuffle}
                            className={`transition-colors p-2 ${
                                isShuffleMode
                                    ? 'text-[var(--primary)]'
                                    : 'text-[var(--text-muted)] hover:text-[var(--primary)]'
                            }`}
                            aria-label={isShuffleMode ? 'Disable shuffle' : 'Enable shuffle'}
                            title={isShuffleMode ? 'Shuffle: ON' : 'Shuffle: OFF'}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.662 48.662 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
                            </svg>
                        </button>
                    </div>

                    {/* Volume control */}
                    <div className="mb-4">
                        <div className="flex items-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--text-muted)]">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.343 6.343l-.707-.707m12.728 12.728l-.707.707M6.343 17.657L4.93 19.07m-4.243-4.243a2.25 2.25 0 010-3.182L4.93 11.314m12.728-4.243a2.25 2.25 0 010 3.182l-1.414 1.414M10.586 8.586a2.25 2.25 0 013.182 3.182M12 12l.01.01" />
                            </svg>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                defaultValue="0.5"
                                onChange={handleVolumeChange}
                                className="flex-1 h-2 bg-[var(--bg-secondary)] rounded-lg appearance-none cursor-pointer accent-[var(--primary)]"
                            />
                        </div>
                    </div>

                    {/* Playlist */}
                    <div className="max-h-48 overflow-y-auto">
                        <p className="text-sm text-[var(--text-muted)] mb-2">Playlist:</p>
                        <div className="space-y-1">
                            {playlist.map((track, index) => (
                                <button
                                    key={track.id}
                                    onClick={() => handleTrackSelect(index)}
                                    className={`w-full text-left px-3 py-2 rounded transition-colors ${
                                        index === currentTrackIndex
                                            ? 'bg-[var(--primary)] text-[var(--primary-contrast)]'
                                            : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">{track.name}</span>
                                        {index === currentTrackIndex && isPlaying && (
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 animate-pulse">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                                            </svg>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default RelaxingSoundsPlayer;
