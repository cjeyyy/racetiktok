/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Settings, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io, Socket } from 'socket.io-client';

const Background = () => {
  const snowflakes = useMemo(() => {
    return Array.from({ length: 150 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 3 + 1,
      opacity: Math.random() * 0.6 + 0.2,
      duration: Math.random() * 5 + 4, // 4s to 9s falling speed
      delay: Math.random() * -10, // Random start time
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
      {snowflakes.map(flake => (
        <div
          key={flake.id}
          className="absolute top-0 bg-white rounded-full animate-snow"
          style={{
            left: flake.left,
            width: `${flake.size}px`,
            height: `${flake.size}px`,
            opacity: flake.opacity,
            animationDuration: `${flake.duration}s`,
            animationDelay: `${flake.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

type Car = { id: string, name: string, flagUrl: string, hue: string, key: string, color: string, customImg: string, carImgUrl?: string };

const VEHICLES = ['1f3ce', '1f697', '1f695', '1f699', '1f693'];

const getRandomItem = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
const getTwemojiUrl = (code: string) => `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${code}.png`;

const getAbbreviation = (flagUrl: string, fallback: string) => {
  const match = flagUrl.match(/flagcdn\.com\/(?:w\d+\/)?([a-z]{2})\.(?:png|svg)/i);
  if (match) return match[1].toUpperCase();
  return fallback.toUpperCase();
};

const BASE_CARS: Car[] = [
  { id: 'vn', name: 'VIETNAM', flagUrl: 'https://flagcdn.com/w80/vn.png', hue: '0deg', key: 'q', color: '#eab308', customImg: '' },
  { id: 'th', name: 'THAILAND', flagUrl: 'https://flagcdn.com/w80/th.png', hue: '0deg', key: 'w', color: '#3b82f6', customImg: '' },
  { id: 'id', name: 'INDONESIA', flagUrl: 'https://flagcdn.com/w80/id.png', hue: '0deg', key: 'e', color: '#ef4444', customImg: '' },
  { id: 'ph', name: 'PHILIPPINES', flagUrl: 'https://flagcdn.com/w80/ph.png', hue: '0deg', key: 'r', color: '#3b82f6', customImg: '' },
  { id: 'my', name: 'MALAYSIA', flagUrl: 'https://flagcdn.com/w80/my.png', hue: '0deg', key: 't', color: '#10b981', customImg: '' },
  { id: 'mm', name: 'MYANMAR', flagUrl: 'https://flagcdn.com/w80/mm.png', hue: '0deg', key: 'y', color: '#facc15', customImg: '' },
  { id: 'kr', name: 'KOREA', flagUrl: 'https://flagcdn.com/w80/kr.png', hue: '0deg', key: 'u', color: '#a855f7', customImg: '' },
  { id: 'jp', name: 'JAPAN', flagUrl: 'https://flagcdn.com/w80/jp.png', hue: '0deg', key: 'i', color: '#f97316', customImg: '' },
  { id: 'sg', name: 'SINGAPORE', flagUrl: 'https://flagcdn.com/w80/sg.png', hue: '0deg', key: 'o', color: '#14b8a6', customImg: '' },
  { id: 'us', name: 'UNITED STATES', flagUrl: 'https://flagcdn.com/w80/us.png', hue: '0deg', key: 'p', color: '#3b82f6', customImg: '' },
];

const INITIAL_CARS: Car[] = BASE_CARS.map(car => ({
  ...car,
  carImgUrl: getTwemojiUrl(getRandomItem(VEHICLES))
}));

const loadInitialCars = (): Car[] => {
  try {
    const saved = localStorage.getItem('race_cars_v11');
    if (saved) {
      const parsed = JSON.parse(saved) as Car[];
      // Ensure the order always matches BASE_CARS
      return parsed.sort((a, b) => {
        const indexA = BASE_CARS.findIndex(c => c.id === a.id);
        const indexB = BASE_CARS.findIndex(c => c.id === b.id);
        return indexA - indexB;
      });
    }
    
    const savedV10 = localStorage.getItem('race_cars_v10');
    if (savedV10) {
      const parsed = JSON.parse(savedV10);
      // We don't want to load old cars if the order changed, so we just use INITIAL_CARS
      // to ensure the new order and new countries (Myanmar, US) are applied.
    }
  } catch (e) {
    console.error("Failed to load cars", e);
  }
  return INITIAL_CARS;
};

const loadInitialWins = (): Record<string, number> => {
  try {
    const saved = localStorage.getItem('race_wins_v11');
    if (saved) return JSON.parse(saved);
    const savedV10 = localStorage.getItem('race_wins_v10');
    if (savedV10) return JSON.parse(savedV10);
  } catch (e) {
    console.error("Failed to load wins", e);
  }
  return INITIAL_CARS.reduce((acc, car) => ({ ...acc, [car.id]: 0 }), {});
};

const FOODS = ['🍉', '🫑', '🍑', '🍌', '🥒', '🥔', '🥦'];

const FINISH_LINE_X = 100; // Percentage of track width (mentok kanan)

export default function App() {
  const [cars, setCars] = useState<Car[]>(loadInitialCars);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [positions, setPositions] = useState<Record<string, number>>(
    INITIAL_CARS.reduce((acc, car) => ({ ...acc, [car.id]: 0 }), {})
  );
  const positionsRef = useRef<Record<string, number>>(positions);

  const [wins, setWins] = useState<Record<string, number>>(loadInitialWins);
  
  // Auto-save cars to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('race_cars_v11', JSON.stringify(cars));
    } catch (e: any) {
      console.error("Failed to save cars", e);
      if (e.name === 'QuotaExceededError') {
        alert("Gagal menyimpan otomatis: Ukuran gambar yang diupload terlalu besar. Coba gunakan gambar dengan resolusi lebih kecil agar bisa tersimpan di browser.");
      }
    }
  }, [cars]);

  // Auto-save wins to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('race_wins_v11', JSON.stringify(wins));
    } catch (e) {
      console.error("Failed to save wins", e);
    }
  }, [wins]);
  
  // Foods are now an array of active food items moving left
  const [foods, setFoods] = useState<{ id: number, carId: string, x: number, emoji: string, type: 'auto' | 'manual', giftUrl?: string }[]>([]);
  const [sparks, setSparks] = useState<{ id: number, carId: string, x: number, createdAt: number }[]>([]);
  
  const [winner, setWinner] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // TikTok Live State
  const [tiktokUsername, setTiktokUsername] = useState('');
  const [tiktokStatus, setTiktokStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [socket, setSocket] = useState<Socket | null>(null);
  
  const spamTrackerRef = useRef<Record<string, { count: number, cooldownUntil: number }>>({});
  const userCarMapRef = useRef<Record<string, string>>({});

  // Initialize Socket.io
  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('tiktok_connected', () => setTiktokStatus('connected'));
    newSocket.on('tiktok_disconnected', () => setTiktokStatus('disconnected'));
    newSocket.on('tiktok_error', (err) => {
      console.error(err);
      setTiktokStatus('disconnected');
      alert('Failed to connect to TikTok Live: ' + err.message);
    });

    return () => { newSocket.close(); };
  }, []);

  // Listen to TikTok Chat & Gifts
  useEffect(() => {
    if (!socket) return;
    
    const handleChat = (data: { uniqueId: string, comment: string }) => {
      if (!isPlaying || winner) return;
      
      const now = Date.now();

      const tracker = spamTrackerRef.current[data.uniqueId] || { count: 0, cooldownUntil: 0 };
      
      if (now < tracker.cooldownUntil) {
        return; // User is in cooldown
      }

      tracker.count += 1;
      if (tracker.count >= 3) {
        tracker.cooldownUntil = now + 10000; // 10 seconds cooldown
        tracker.count = 0; // reset count after cooldown
      }
      
      spamTrackerRef.current[data.uniqueId] = tracker;

      const comment = data.comment.toLowerCase().trim();
      // Check if comment matches a car ID (e.g., "id", "vn") or name
      const car = cars.find(c => c.id === comment || c.name.toLowerCase() === comment);
      
      if (car) {
        userCarMapRef.current[data.uniqueId] = car.id;
        const randomFood = FOODS[Math.floor(Math.random() * FOODS.length)];
        setFoods(prev => [...prev, {
          id: Math.random(),
          carId: car.id,
          x: FINISH_LINE_X,
          emoji: randomFood,
          type: 'auto'
        }]);
      }
    };

    const handleGift = (data: { uniqueId: string, giftName: string, giftPictureUrl?: string, amount?: number }) => {
      if (!isPlaying || winner) return;
      
      const carId = userCarMapRef.current[data.uniqueId];
      
      if (carId) {
        const amount = data.amount || 1;
        const newFoods = Array.from({ length: amount }).map(() => ({
          id: Math.random(),
          carId: carId,
          x: FINISH_LINE_X + (Math.random() * 5), // Slight offset for multiple gifts
          emoji: '🎁',
          type: 'manual' as const,
          giftUrl: data.giftPictureUrl
        }));
        
        setFoods(prev => [...prev, ...newFoods]);
      }
    };

    socket.on('tiktok_chat', handleChat);
    socket.on('tiktok_gift', handleGift);
    
    return () => { 
      socket.off('tiktok_chat', handleChat); 
      socket.off('tiktok_gift', handleGift); 
    };
  }, [socket, isPlaying, winner, cars]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const winHandledRef = useRef(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, index: number, field: keyof Car) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newCars = [...cars];
        newCars[index] = { ...newCars[index], [field]: reader.result as string };
        setCars(newCars);
      };
      reader.readAsDataURL(file);
    }
  };

  const resetLeaderboard = () => {
    setWins(cars.reduce((acc, car) => ({ ...acc, [car.id]: 0 }), {}));
  };

  const playPopSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      // Smooth, satisfying "bloop" / chime sound
      const duration = 0.3;
      
      // Main oscillator (sine wave for smoothness)
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      
      // Pitch sweeps up quickly for a satisfying "pop"
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
      
      // Second oscillator for a subtle harmonic chime
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(600, ctx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);

      // Gain envelope for smooth attack and decay
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      
      osc.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(ctx.currentTime);
      osc2.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
      osc2.stop(ctx.currentTime + duration);
    } catch (e) {
      console.error("Audio play failed:", e);
    }
  }, []);

  const playWinSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      const startTime = ctx.currentTime;
      
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime + i * 0.15);
        
        gain.gain.setValueAtTime(0, startTime + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.3, startTime + i * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + i * 0.15 + 0.3);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(startTime + i * 0.15);
        osc.stop(startTime + i * 0.15 + 0.3);
      });
      
      // Final chord
      [261.63, 329.63, 392.00, 523.25].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, startTime + 0.6);
        
        gain.gain.setValueAtTime(0, startTime + 0.6);
        gain.gain.linearRampToValueAtTime(0.2, startTime + 0.6 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.6 + 0.8);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(startTime + 0.6);
        osc.stop(startTime + 0.6 + 0.8);
      });

    } catch (e) {
      console.error("Win audio play failed:", e);
    }
  }, []);

  useEffect(() => {
    // Initialize audio with reliable sources
    audioRef.current = new Audio('https://actions.google.com/sounds/v1/transportation/car_driving_fast.ogg');
    audioRef.current.loop = true;

    winSoundRef.current = new Audio('https://actions.google.com/sounds/v1/cartoon/cartoon_success_fanfare.ogg');
    winSoundRef.current.preload = 'auto';
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Global click to unblock audio
  useEffect(() => {
    const handleGlobalClick = () => {
      if (audioBlocked && isPlaying && audioRef.current) {
        audioRef.current.play().then(() => setAudioBlocked(false)).catch(() => {});
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [audioBlocked, isPlaying]);

  const startGame = useCallback(() => {
    const initialPos = cars.reduce((acc, car) => ({ ...acc, [car.id]: 0 }), {});
    setPositions(initialPos);
    positionsRef.current = initialPos;
    setFoods([]);
    setSparks([]);
    setWinner(null);
    winHandledRef.current = false;
    setIsPlaying(true);
    
    // Resume audio context on user interaction
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (audioRef.current) {
      audioRef.current.play().catch(e => {
        console.log("Audio play failed:", e);
        setAudioBlocked(true);
      });
    }
  }, [cars]);

  // Auto-start on mount
  useEffect(() => {
    startGame();
  }, [startGame]);

  const handleWin = useCallback((carId: string) => {
    if (winHandledRef.current) return;
    winHandledRef.current = true;
    
    setWinner(carId);
    setIsPlaying(false);
    setWins(prev => ({ ...prev, [carId]: prev[carId] + 1 }));
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // Play win sound
    playWinSound();
    if (winSoundRef.current) {
      winSoundRef.current.currentTime = 0;
      winSoundRef.current.play().catch(e => console.log("Win sound fallback failed:", e));
    }

    // Auto restart after 1.5 seconds
    setTimeout(() => {
      startGame();
    }, 1500);
  }, [startGame]);

  // Game Loop for moving food and checking collisions
  useEffect(() => {
    if (!isPlaying || winner) return;

    const interval = setInterval(() => {
      setFoods(prevFoods => {
        const nextFoods: typeof prevFoods = [];
        const carsToMoveAuto: string[] = [];
        const carsToMoveManual: string[] = [];
        const newSparks: { id: number, carId: string, x: number, createdAt: number }[] = [];

        prevFoods.forEach(food => {
          const newX = food.x - 1.5; // Food moves left
          const carX = positionsRef.current[food.carId];
          
          // Check collision (car front is roughly at carX + 5)
          if (newX <= carX + 5) {
            if (food.type === 'auto') {
              carsToMoveAuto.push(food.carId);
            } else {
              carsToMoveManual.push(food.carId);
            }
            playPopSound();
            newSparks.push({ id: Math.random(), carId: food.carId, x: newX, createdAt: Date.now() });
          } else {
            nextFoods.push({ ...food, x: newX });
          }
        });

        if (carsToMoveAuto.length > 0 || carsToMoveManual.length > 0) {
          setPositions(prevPos => {
            const newPos = { ...prevPos };
            carsToMoveAuto.forEach(carId => {
              newPos[carId] += 1.5; // maju dikit bgt
              if (newPos[carId] >= FINISH_LINE_X) {
                newPos[carId] = FINISH_LINE_X;
                handleWin(carId);
              }
            });
            carsToMoveManual.forEach(carId => {
              newPos[carId] += 1.5; // maju sama kek komen
              if (newPos[carId] >= FINISH_LINE_X) {
                newPos[carId] = FINISH_LINE_X;
                handleWin(carId);
              }
            });
            positionsRef.current = newPos;
            return newPos;
          });
        }

        setSparks(prev => {
          const activeSparks = prev.filter(s => Date.now() - s.createdAt < 300);
          return newSparks.length > 0 ? [...activeSparks, ...newSparks] : activeSparks;
        });

        return nextFoods;
      });
    }, 30); // ~33fps

    return () => clearInterval(interval);
  }, [isPlaying, winner, handleWin, playPopSound]);

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (!isPlaying || winner) return;

    const car = cars.find(c => c.key === e.key.toLowerCase());
    if (car) {
      // Spawn food at the finish line
      const randomFood = FOODS[Math.floor(Math.random() * FOODS.length)];
      setFoods(prev => [...prev, {
        id: Math.random(),
        carId: car.id,
        x: FINISH_LINE_X,
        emoji: randomFood,
        type: 'manual'
      }]);
    }
  }, [isPlaying, winner, cars]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Dynamic Leaderboard - Only show cars with > 0 wins
  const winningCars = [...cars].filter(c => wins[c.id] > 0).sort((a, b) => wins[b.id] - wins[a.id]);

  return (
    <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center overflow-hidden relative">
      {/* Game Container */}
      <div 
        className="bg-black text-white font-sans overflow-hidden flex flex-col relative w-full h-full"
      >
        <Background />
        {/* Header / Scoreboard */}
      <div className="flex justify-center items-center pt-12 pb-2 gap-2 sm:gap-6 relative z-10 h-40">
        <div className="flex gap-1 sm:gap-2 items-end h-full w-full max-w-[600px] px-2 sm:px-4 justify-center">
          {/* 4th Place */}
          <div className="flex flex-col items-center justify-end flex-1 max-w-[80px] h-full pb-2">
            {winningCars[3] && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center border border-gray-700 rounded-lg p-1 sm:p-2 bg-gray-900/40 w-full min-w-0">
                <img src={winningCars[3].flagUrl} alt="4th" className="w-8 h-5 sm:w-10 sm:h-6 object-cover rounded-sm" />
                <div className="text-[10px] sm:text-xs font-bold mt-1 text-gray-400 truncate w-full text-center">{wins[winningCars[3].id]}</div>
              </motion.div>
            )}
          </div>

          {/* 2nd Place */}
          <div className="flex flex-col items-center justify-end flex-1 max-w-[100px] h-full pb-2">
            {winningCars[1] && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center border border-gray-500 rounded-lg p-1.5 sm:p-3 bg-gray-900/60 w-full min-w-0">
                <img src={winningCars[1].flagUrl} alt="2nd" className="w-10 h-6 sm:w-12 sm:h-8 object-cover rounded-sm" />
                <div className="text-xs sm:text-sm font-bold mt-1 text-gray-300 truncate w-full text-center">{wins[winningCars[1].id]}</div>
              </motion.div>
            )}
          </div>
          
          {/* 1st Place */}
          <div className="flex flex-col items-center justify-end flex-1 max-w-[110px] h-full pb-2 mx-1 sm:mx-2">
            {winningCars[0] && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center border-2 border-yellow-500 rounded-lg p-1.5 sm:p-3 bg-yellow-500/10 transform scale-105 z-10 shadow-[0_0_20px_rgba(234,179,8,0.3)] w-full relative min-w-0">
                <img src={winningCars[0].flagUrl} alt="1st" className="w-12 h-7 sm:w-14 sm:h-9 object-cover rounded-sm border border-yellow-500/30" />
                <div className="text-sm sm:text-lg font-black mt-1 text-yellow-500 truncate w-full text-center">{wins[winningCars[0].id]}</div>
              </motion.div>
            )}
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center justify-end flex-1 max-w-[100px] h-full pb-2">
            {winningCars[2] && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center border border-gray-600 rounded-lg p-1.5 sm:p-3 bg-gray-900/50 w-full min-w-0">
                <img src={winningCars[2].flagUrl} alt="3rd" className="w-10 h-6 sm:w-12 sm:h-8 object-cover rounded-sm" />
                <div className="text-xs sm:text-sm font-bold mt-1 text-orange-400 truncate w-full text-center">{wins[winningCars[2].id]}</div>
              </motion.div>
            )}
          </div>

          {/* 5th Place */}
          <div className="flex flex-col items-center justify-end flex-1 max-w-[80px] h-full pb-2">
            {winningCars[4] && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center border border-gray-700 rounded-lg p-1 sm:p-2 bg-gray-900/40 w-full min-w-0">
                <img src={winningCars[4].flagUrl} alt="5th" className="w-8 h-5 sm:w-10 sm:h-6 object-cover rounded-sm" />
                <div className="text-[10px] sm:text-xs font-bold mt-1 text-gray-500 truncate w-full text-center">{wins[winningCars[4].id]}</div>
              </motion.div>
            )}
          </div>
        </div>
        
        <button 
          onClick={() => {
            if (isPlaying) {
              setIsPlaying(false);
              if (audioRef.current) audioRef.current.pause();
            }
            setIsSettingsOpen(true);
          }}
          className="absolute right-6 top-6 p-2 hover:bg-white/10 rounded-full transition-colors"
        >
          <Settings size={24} className="text-gray-400" />
        </button>
      </div>

      {/* Race Track Area */}
      <div className="flex-1 relative border-t border-b border-gray-800 asphalt-bg overflow-hidden flex shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        
        {/* Tracks */}
        <div className="w-full h-full flex flex-col justify-around py-4 gap-2 relative z-10">
          {cars.map((car, index) => (
            <div key={car.id} className="relative flex-1 flex items-center group min-h-[30px]">
              
              {/* Country Abbreviation before finish line */}
              <div 
                className="absolute font-black text-xl text-gray-500/80 z-0 tracking-widest animate-text-pulse"
                style={{ right: '60px' }}
              >
                {getAbbreviation(car.flagUrl, car.id)}
              </div>

              {/* Track Area (Full width) */}
              <div className="absolute left-0 right-0 h-full">
                {/* Dashed Track Line (Lane Divider at the bottom of each lane) */}
                <div className={`absolute bottom-0 left-0 right-0 h-[2px] z-0 track-line ${!isPlaying ? '[animation-play-state:paused]' : ''}`}></div>
                {/* Thin black line right below the dashed line */}
                <div className="absolute bottom-[-1px] left-0 right-0 h-[1px] bg-black z-0"></div>

                {/* Starting Line Elements (Flag and Custom Image) */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10 pl-1">
                  <div className="flex items-center justify-center w-10 h-7 bg-white/5 rounded-sm overflow-hidden border border-gray-800">
                    <img src={car.flagUrl} alt={car.name} className="w-full h-full object-cover" />
                  </div>
                </div>

                {/* Car Movable Area */}
                <div className="absolute left-[50px] right-0 h-full">
                  {/* The Car */}
                  <motion.div
                    className={`absolute z-30 flex items-center h-full ${isPlaying ? 'car-driving' : ''}`}
                    initial={{ left: '0%' }}
                    animate={{ left: `calc(${positions[car.id]}% - 96px * ${positions[car.id]} / 100)` }}
                    transition={{ type: 'tween', ease: 'linear', duration: 0.05 }}
                  >
                  {/* Motion Blur Effect when moving */}
                  {isPlaying && positions[car.id] > 0 && (
                    <div className="absolute -left-4 w-10 h-4 bg-gradient-to-r from-transparent to-cyan-500/30 blur-sm rounded-full" />
                  )}
                  
                  {/* Car Image with Glow */}
                  <div className="relative w-24 h-12 flex items-center justify-center">
                    {/* Colored Glow Effect */}
                    <div 
                      className="absolute inset-0 rounded-full opacity-40 blur-md z-0"
                      style={{ backgroundColor: car.color, transform: 'scaleY(0.6) scaleX(0.8)' }}
                    />

                    {/* NOS Boost Effect when moving */}
                    {isPlaying && (
                      <div className="absolute left-3 bottom-3 w-2 h-2 nos-flame z-0" />
                    )}

                    {/* Vehicle */}
                    <img 
                      src={car.carImgUrl || getTwemojiUrl('1f3ce')} 
                      alt={car.name} 
                      className="w-full h-full object-contain scale-x-[-1] relative z-10" 
                      style={{ 
                        filter: `hue-rotate(${car.hue}) drop-shadow(1px 1px 0 rgba(255,255,255,0.8)) drop-shadow(-1px -1px 0 rgba(255,255,255,0.8)) drop-shadow(1px -1px 0 rgba(255,255,255,0.8)) drop-shadow(-1px 1px 0 rgba(255,255,255,0.8)) drop-shadow(0 4px 4px rgba(0,0,0,0.5))` 
                      }}
                      referrerPolicy="no-referrer" 
                    />
                  </div>
                </motion.div>

                {/* Food Items for this car */}
                {foods.filter(f => f.carId === car.id).map(food => {
                  const carX = positions[car.id] || 0;
                  const distance = Math.max(0, food.x - carX);
                  const scale = 1 + (distance / FINISH_LINE_X) * 2; // Starts at 3x, shrinks to 1x when hitting car
                  return (
                    <div
                      key={food.id}
                      className={`absolute z-20 text-xl drop-shadow-lg h-full flex items-center`}
                      style={{ 
                        left: `calc(${food.x}% - 24px * ${food.x} / 100)`, 
                        transition: 'left 0.03s linear',
                        transform: `scale(${scale})`,
                        transformOrigin: 'center'
                      }}
                    >
                      {food.giftUrl ? (
                        <img src={food.giftUrl} alt="gift" className="w-6 h-6 object-contain drop-shadow-xl" />
                      ) : car.customImg ? (
                        <img src={car.customImg} alt="food" className="w-6 h-6 object-cover rounded-md grayscale" />
                      ) : (
                        food.emoji
                      )}
                    </div>
                  );
                })}

                {/* Sparks for this car */}
                {sparks.filter(s => s.carId === car.id).map(spark => (
                  <div
                    key={spark.id}
                    className="absolute z-40 h-full flex items-center justify-center pointer-events-none"
                    style={{ left: `calc(${spark.x}% - 24px * ${spark.x} / 100)` }}
                  >
                    {[
                      { x: -20, y: -20, color: '#fbbf24' },
                      { x: 20, y: -15, color: '#f87171' },
                      { x: -15, y: 20, color: '#60a5fa' },
                      { x: 25, y: 20, color: '#34d399' },
                      { x: 0, y: -25, color: '#a78bfa' },
                      { x: 0, y: 25, color: '#fbbf24' },
                    ].map((p, i) => (
                      <motion.div
                        key={i}
                        className="absolute w-1.5 h-1.5 rounded-full drop-shadow-md"
                        style={{ backgroundColor: p.color }}
                        initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                        animate={{ 
                          x: p.x, 
                          y: p.y, 
                          scale: 0, 
                          opacity: 0 
                        }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      />
                    ))}
                  </div>
                ))}
                </div>
              </div>

            </div>
          ))}
        </div>

        {/* Track Area Container (Offset by left panel width) - Placed after tracks for higher z-index */}
        <div className="absolute left-[90px] right-0 top-0 bottom-0 pointer-events-none z-20">
          {/* Red Ribbon/Tape (Before the finish line) */}
          <div 
            className="absolute top-0 bottom-0 w-1.5 bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.8)] z-30"
            style={{ 
              left: `calc(${FINISH_LINE_X}% - 32px - 6px)`,
            }}
          />
          {/* Finish Line (Checkered) */}
          <div 
            className="absolute top-0 bottom-0 w-8 border-l-2 border-white/20 opacity-80 mix-blend-overlay"
            style={{ 
              left: `calc(${FINISH_LINE_X}% - 32px)`,
              background: `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="10" height="10" fill="white"/><rect x="10" y="10" width="10" height="10" fill="white"/><rect x="10" width="10" height="10" fill="black"/><rect y="10" width="10" height="10" fill="black"/></svg>') repeat`
            }}
          />
        </div>
      </div>

      {/* Bottom Keyboard Shortcuts */}
      <div className="h-24 bg-transparent border-t border-gray-800 flex justify-center items-center gap-6 px-4 z-20">
        {cars.map(car => (
          <div key={car.id} className="flex flex-col items-center gap-1">
            <div className="flex items-center justify-center w-8 h-5 bg-white/5 rounded overflow-hidden border border-gray-800">
              <img src={car.flagUrl} alt={car.name} className="w-full h-full object-cover" />
            </div>
            <div className={`
              w-10 h-10 rounded-xl border-b-4 flex items-center justify-center text-lg font-black
              ${isPlaying ? 'bg-gray-800 border-gray-900 text-white active:translate-y-1 active:border-b-0 active:mt-1' : 'bg-gray-800 border-gray-900 text-gray-500'}
              transition-all duration-75
            `}>
              {car.key.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Winner Overlay */}
      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              className="text-center flex flex-col items-center relative"
            >
              <div className="rounded-lg overflow-hidden border-4 border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.5)] relative z-0">
                <img src={cars.find(c => c.id === winner)?.flagUrl} alt="Winner Flag" className="w-48 h-32 object-cover" />
              </div>
            </motion.div>
            
            {/* Confetti effect */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
               {[...Array(40)].map((_, i) => (
                 <motion.div
                   key={i}
                   initial={{ 
                     y: -20, 
                     x: Math.random() * window.innerWidth,
                     rotate: 0,
                     opacity: 1
                   }}
                   animate={{ 
                     y: window.innerHeight + 20,
                     rotate: 360 * (Math.random() > 0.5 ? 1 : -1),
                     opacity: 0
                   }}
                   transition={{ 
                     duration: 2 + Math.random() * 3,
                     repeat: Infinity,
                     ease: "linear",
                     delay: Math.random() * 2
                   }}
                   className="absolute w-4 h-4 rounded-sm"
                   style={{ 
                     backgroundColor: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'][Math.floor(Math.random() * 6)]
                   }}
                 />
               ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TikTok Live Connection UI */}
      <div className="absolute left-6 bottom-6 flex items-center gap-2 bg-gray-900/80 p-2 rounded-lg border border-gray-700 z-50 shadow-lg">
        <input 
          type="text" 
          placeholder="TikTok Username" 
          className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm outline-none focus:border-yellow-500 border border-transparent w-40"
          value={tiktokUsername}
          onChange={e => setTiktokUsername(e.target.value)}
          disabled={tiktokStatus !== 'disconnected'}
        />
        {tiktokStatus === 'disconnected' ? (
          <button 
            onClick={() => {
              if (tiktokUsername && socket) {
                setTiktokStatus('connecting');
                const cleanUsername = tiktokUsername.replace('@', '').trim();
                socket.emit('connect_tiktok', cleanUsername);
              }
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm font-bold transition-colors"
          >
            Connect Live
          </button>
        ) : (
          <button 
            onClick={() => {
              if (socket) socket.emit('disconnect_tiktok');
            }}
            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm font-bold transition-colors flex items-center gap-2"
          >
            {tiktokStatus === 'connected' && <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>}
            {tiktokStatus === 'connecting' ? 'Connecting...' : 'Disconnect'}
          </button>
        )}
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Settings</h2>
              <button 
                onClick={resetLeaderboard}
                className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/50 rounded-lg transition-colors text-sm font-bold"
              >
                Reset Leaderboard
              </button>
            </div>
            <div className="space-y-6">
              {cars.map((car, index) => (
                <div key={car.id} className="bg-gray-800 p-4 rounded-lg space-y-3">
                  <h3 className="text-lg font-semibold text-white">Lane {index + 1}</h3>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Flag Image</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={car.flagUrl}
                        onChange={(e) => {
                          const newCars = [...cars];
                          newCars[index].flagUrl = e.target.value;
                          setCars(newCars);
                        }}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-yellow-500"
                        placeholder="URL..."
                      />
                      <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm flex items-center transition-colors">
                        Upload
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, index, 'flagUrl')} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Custom Image (Gift/Logo)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={car.customImg || ''}
                        onChange={(e) => {
                          const newCars = [...cars];
                          newCars[index].customImg = e.target.value;
                          setCars(newCars);
                        }}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-yellow-500"
                        placeholder="Leave empty for blank box"
                      />
                      <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm flex items-center transition-colors">
                        Upload
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, index, 'customImg')} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Car Image (Optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={car.carImgUrl || ''}
                        onChange={(e) => {
                          const newCars = [...cars];
                          newCars[index].carImgUrl = e.target.value;
                          setCars(newCars);
                        }}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-yellow-500"
                        placeholder="Leave empty for default car"
                      />
                      <label className="cursor-pointer bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm flex items-center transition-colors">
                        Upload
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, index, 'carImgUrl')} />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  startGame(); // Restart game with new settings
                }}
                className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-lg transition-colors"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
