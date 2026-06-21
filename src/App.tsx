import { useState, useRef, useEffect } from 'react';
import './App.css';

// 定数定義
const BASE_URL = import.meta.env.BASE_URL || '/';

const ANIMALS = {
  rabbit: { name: 'うさぎさん', img: `${BASE_URL}images/rabbit.jpg`, color: '#ff7f50', towerX: 25 },
  bear: { name: 'くまさん', img: `${BASE_URL}images/bear.jpg`, color: '#ffb703', towerX: 55 },
  monkey: { name: 'さるさん', img: `${BASE_URL}images/monkey.jpg`, color: '#1982c4', towerX: 85 }
};

const FOODS = {
  carrot: { name: 'にんじん', emoji: '🥕', img: `${BASE_URL}images/carrot.jpg` },
  apple: { name: 'りんご', emoji: '🍎', img: `${BASE_URL}images/apple.jpg` },
  banana: { name: 'バナナ', emoji: '🍌', img: `${BASE_URL}images/banana.jpg` }
};

const GHOST_TYPES = {
  normal: { emoji: '👻', name: 'オバケちゃん', speed: 0.35, maxHp: 8, color: '#f3f4f6' },
  fast: { emoji: '🦇', name: 'パタパタコウモリ', speed: 0.6, maxHp: 5, color: '#e9d5ff' },
  fat: { emoji: '👹', name: 'くいしんぼうオニ', speed: 0.2, maxHp: 20, color: '#fca5a5' }
};

type Level = 2 | 3 | 5 | 'random';
type GameMode = 'multiplication' | 'subtraction';

interface Question {
  mode: GameMode;
  multiplier: number;   // 掛け算: 1皿あたりの個数 / 引き算: 引かれる数 (最初の数)
  multiplicand: number; // 掛け算: 皿の数 / 引き算: 引く数 (あげる数)
  food: keyof typeof FOODS;
  animal: keyof typeof ANIMALS;
}

interface Enemy {
  id: number;
  x: number; // 道の横位置 (%, 100から左端の15へ向かう)
  y: number; // 縦位置 (px)
  hp: number;
  maxHp: number;
  type: keyof typeof GHOST_TYPES;
  emoji: string;
  speed: number;
  isSatiated: boolean;
  satiatedTimer: number;
}

interface Projectile {
  id: number;
  x: number;
  y: number;
  targetEnemyId: number;
  food: keyof typeof FOODS;
  speed: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  char: string;
  color: string;
}

function App() {
  // 画面遷移 & モード設定
  const [screen, setScreen] = useState<'title' | 'mode_select' | 'level_select' | 'playing' | 'clear' | 'gameover'>('title');
  const [gameMode, setGameMode] = useState<GameMode>('multiplication');
  const [level, setLevel] = useState<Level>(2);
  
  // タワーディフェンス関係の状態
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [lives, setLives] = useState<number>(3);
  const [wave, setWave] = useState<number>(1);
  const [waveActive, setWaveActive] = useState<boolean>(false);
  const [attackingTower, setAttackingTower] = useState<keyof typeof ANIMALS | null>(null);

  // 掛け算・引き算レッスン関係の状態
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [lastQuestions, setLastQuestions] = useState<string[]>([]); // 重複防止履歴
  
  // かけざん用
  const [placedPlates, setPlacedPlates] = useState<number>(0);
  // ひきざん用 (消した果物のインデックス)
  const [removedIndices, setRemovedIndices] = useState<number[]>([]);

  const [showFeedback, setShowFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [isEating, setIsEating] = useState<boolean>(false);
  const [isHappy, setIsHappy] = useState<boolean>(false);
  const [totalScore, setTotalScore] = useState<number>(0);
  const [questionsAnswered, setQuestionsAnswered] = useState<number>(0);
  
  // オーディオとエフェクト
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [particles, setParticles] = useState<Particle[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 1. 効果音ジェネレーター
  const playSound = (type: 'plate' | 'correct' | 'wrong' | 'clear' | 'remove' | 'shoot' | 'hit' | 'damage') => {
    if (!audioEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;

      if (type === 'plate') {
        // お皿を置いた/果物を戻した音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'remove') {
        // お皿を消した/果物を消した音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'shoot') {
        // 弾丸発射音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'hit') {
        // 弾命中音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.06);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'damage') {
        // テント被弾音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'correct') {
        // 正解ファンファーレ
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.12, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.08 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.2);
        });
      } else if (type === 'wrong') {
        // 不正解音
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(130, now);
        osc2.frequency.setValueAtTime(133, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.4);
        osc2.stop(now + 0.4);
      } else if (type === 'clear') {
        // ステージクリアファンファーレ
        const chords = [
          [261.63, 329.63, 392.00], // C4
          [349.23, 440.00, 523.25], // F4
          [392.00, 493.88, 587.33], // G4
          [523.25, 659.25, 783.99, 1046.50] // C5
        ];
        chords.forEach((chord, chordIdx) => {
          chord.forEach((freq) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + chordIdx * 0.23);
            const duration = chordIdx === 3 ? 0.7 : 0.2;
            gain.gain.setValueAtTime(0.08, now + chordIdx * 0.23);
            gain.gain.exponentialRampToValueAtTime(0.001, now + chordIdx * 0.23 + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + chordIdx * 0.23);
            osc.stop(now + chordIdx * 0.23 + duration);
          });
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 2. 星吹雪パーティクル
  const triggerParticles = () => {
    const newParticles: Particle[] = [];
    const colors = ['#ff7f50', '#ffb703', '#8ac926', '#1982c4', '#ff5964', '#ff70a6'];
    const shapes = ['★', '🌸', '✨', '🎈', '🍀', '🍎', '🥕', '🍌'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 250;
      newParticles.push({
        id: Date.now() + i,
        x: window.innerWidth / 2,
        y: window.innerHeight / 3,
        tx: Math.cos(angle) * speed,
        ty: Math.sin(angle) * speed - 120,
        char: shapes[Math.floor(Math.random() * shapes.length)],
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    setParticles(newParticles);
    setTimeout(() => {
      setParticles([]);
    }, 1500);
  };

  // 3. 掛け算・引き算問題生成
  const generateQuestion = (selectedLevel: Level): Question => {
    const animalsList: (keyof typeof ANIMALS)[] = ['rabbit', 'bear', 'monkey'];
    let multiplier = 2;
    let food: keyof typeof FOODS = 'carrot';

    // 3-a. 食べ物と基本数の決定
    if (gameMode === 'multiplication') {
      if (selectedLevel === 'random') {
        const rand = Math.floor(Math.random() * 3);
        if (rand === 0) { multiplier = 2; food = 'carrot'; }
        else if (rand === 1) { multiplier = 3; food = 'apple'; }
        else { multiplier = 5; food = 'banana'; }
      } else {
        multiplier = selectedLevel;
        if (selectedLevel === 2) food = 'carrot';
        if (selectedLevel === 3) food = 'apple';
        if (selectedLevel === 5) food = 'banana';
      }
    } else {
      // 引き算モード時: multiplier は「引かれる数 (minuend)」として扱う
      // レベルに応じて引かれる数の最大範囲を設定
      let maxMinuend = 5;
      if (selectedLevel === 2) maxMinuend = 5;
      else if (selectedLevel === 3) maxMinuend = 8;
      else if (selectedLevel === 5) maxMinuend = 10;
      else maxMinuend = 10;

      const minMinuend = selectedLevel === 'random' ? 2 : (selectedLevel as number);
      multiplier = Math.floor(Math.random() * (maxMinuend - minMinuend + 1)) + minMinuend;
      
      // 食べ物はランダム
      const randFood = Math.floor(Math.random() * 3);
      if (randFood === 0) food = 'carrot';
      else if (randFood === 1) food = 'apple';
      else food = 'banana';
    }

    // 3-b. 掛ける数 (皿の数) または 引く数 (あげる数) の決定
    let multiplicand = 1;
    let attempts = 0;
    
    while (attempts < 15) {
      if (gameMode === 'multiplication') {
        const maxMultiplicand = multiplier === 5 ? 4 : 5;
        multiplicand = Math.floor(Math.random() * maxMultiplicand) + 1;
      } else {
        // 引き算: 1 から multiplier-1 までのランダム (答えが0にならないように)
        multiplicand = Math.floor(Math.random() * (multiplier - 1)) + 1;
      }

      const questionKey = `${gameMode}-${multiplier}*${multiplicand}`;
      if (!lastQuestions.includes(questionKey)) {
        const newHistory = [...lastQuestions, questionKey];
        if (newHistory.length > 3) newHistory.shift();
        setLastQuestions(newHistory);
        break;
      }
      attempts++;
    }

    const animal = animalsList[Math.floor(Math.random() * animalsList.length)];
    return { mode: gameMode, multiplier, multiplicand, food, animal };
  };

  // 4. ゲームの開始
  const startGame = (selectedLevel: Level) => {
    setLevel(selectedLevel);
    setLives(3);
    setWave(1);
    setTotalScore(0);
    setQuestionsAnswered(0);
    setLastQuestions([]);
    setEnemies([]);
    setProjectiles([]);
    setPlacedPlates(0);
    setRemovedIndices([]);
    setShowFeedback(null);
    setIsEating(false);
    setIsHappy(false);
    setScreen('playing');

    spawnWaveEnemies(1);

    const q = generateQuestion(selectedLevel);
    setCurrentQuestion(q);
  };

  // 5. 敵のウェーブスポーン
  const spawnWaveEnemies = (waveNum: number) => {
    setWaveActive(true);
    const newEnemies: Enemy[] = [];
    const types: (keyof typeof GHOST_TYPES)[] = waveNum === 1 
      ? ['normal'] 
      : waveNum === 2 
        ? ['normal', 'fast'] 
        : ['normal', 'fast', 'fat'];

    const enemyCount = waveNum * 2 + 1;

    for (let i = 0; i < enemyCount; i++) {
      const type = (waveNum === 3 && i === enemyCount - 1) 
        ? 'fat' 
        : types[Math.floor(Math.random() * types.length)];
      
      const config = GHOST_TYPES[type];

      newEnemies.push({
        id: Date.now() + i,
        x: 100 + i * 20,
        y: 65 + (i % 2) * 12,
        hp: config.maxHp,
        maxHp: config.maxHp,
        type,
        emoji: config.emoji,
        speed: config.speed,
        isSatiated: false,
        satiatedTimer: 0
      });
    }
    setEnemies(newEnemies);
  };

  // 6. メインゲームループ (リアルタイム進行)
  useEffect(() => {
    if (screen !== 'playing') return;
    if (showFeedback === 'correct') return;

    const interval = setInterval(() => {
      // 6-a. 敵の移動処理
      setEnemies(prevEnemies => {
        let reachedGoal = false;
        const updated = prevEnemies.map(enemy => {
          if (enemy.isSatiated) {
            if (enemy.satiatedTimer > 0) {
              return { ...enemy, satiatedTimer: enemy.satiatedTimer - 50 };
            }
            return null;
          }

          const nextX = enemy.x - enemy.speed;
          if (nextX <= 15) {
            reachedGoal = true;
            return null;
          }
          return { ...enemy, x: nextX };
        }).filter((e): e is Enemy => e !== null);

        if (reachedGoal) {
          playSound('damage');
          setLives(prev => {
            const nextLives = prev - 1;
            if (nextLives <= 0) {
              setScreen('gameover');
            }
            return nextLives;
          });
        }
        return updated;
      });

      // 6-b. 弾の移動とLERP追尾・当たり判定
      setProjectiles(prevProjectiles => {
        const nextProjectiles: Projectile[] = [];

        prevProjectiles.forEach(p => {
          let target: Enemy | undefined;
          setEnemies(currentEnemies => {
            target = currentEnemies.find(e => e.id === p.targetEnemyId && !e.isSatiated);
            return currentEnemies;
          });

          if (!target) {
            setEnemies(currentEnemies => {
              const alive = currentEnemies.filter(e => !e.isSatiated && e.x < 100);
              if (alive.length > 0) {
                target = alive.reduce((prev, curr) => prev.x < curr.x ? prev : curr);
              }
              return currentEnemies;
            });
          }

          if (target) {
            const targetX = target.x;
            const targetY = target.y;

            // LERP追尾
            const nextX = p.x + (targetX - p.x) * 0.15;
            const nextY = p.y + (targetY - p.y) * 0.15;

            const dx = Math.abs(targetX - p.x);
            const dy = Math.abs(targetY - p.y);

            // 当たり判定 (X軸3.5%, Y軸15px)
            if (dx < 3.5 && dy < 15) {
              playSound('hit');
              const hitId = target.id;
              
              setEnemies(currEnemies => 
                currEnemies.map(e => {
                  if (e.id === hitId) {
                    const nextHp = e.hp - 1;
                    if (nextHp <= 0) {
                      return { ...e, hp: 0, isSatiated: true, satiatedTimer: 1000 };
                    }
                    return { ...e, hp: nextHp };
                  }
                  return e;
                })
              );
            } else {
              nextProjectiles.push({
                ...p,
                x: nextX,
                y: nextY
              });
            }
          } else {
            const nextX = p.x - p.speed;
            if (nextX > 15) {
              nextProjectiles.push({ ...p, x: nextX });
            }
          }
        });

        return nextProjectiles;
      });

    }, 50);

    return () => clearInterval(interval);
  }, [screen, showFeedback]);

  // 7. ウェーブクリアチェック
  useEffect(() => {
    if (!waveActive || enemies.length > 0 || screen !== 'playing') return;

    setWaveActive(false);
    if (wave < 3) {
      setWave(prev => prev + 1);
      spawnWaveEnemies(wave + 1);
      playSound('clear');
    } else {
      playSound('clear');
      setScreen('clear');
    }
  }, [enemies, waveActive, wave, screen]);

  // 8. かけざん用：お皿の追加と削除
  const addPlate = () => {
    if (showFeedback) return;
    if (placedPlates >= 6) return;
    setPlacedPlates(prev => prev + 1);
    playSound('plate');
  };

  const removePlate = () => {
    if (showFeedback) return;
    if (placedPlates <= 0) return;
    setPlacedPlates(prev => prev - 1);
    playSound('remove');
  };

  // 8-b. ひきざん用：果物のタップ消去トグル
  const toggleRemoveItem = (index: number) => {
    if (showFeedback) return;
    
    if (removedIndices.includes(index)) {
      // 戻す (半透明を解除)
      setRemovedIndices(prev => prev.filter(i => i !== index));
      playSound('plate');
    } else {
      // 消す (半透明にする)
      setRemovedIndices(prev => [...prev, index]);
      playSound('remove');
    }
  };

  // 9. 答え合わせ & 攻撃トリガー
  const checkAnswer = () => {
    if (showFeedback || !currentQuestion) return;

    // モードによって正解判定を切り替える
    const isCorrect = gameMode === 'multiplication'
      ? placedPlates === currentQuestion.multiplicand
      : removedIndices.length === currentQuestion.multiplicand; // 引き算: 消した数が「引く数」と等しいこと

    if (isCorrect) {
      playSound('correct');
      setShowFeedback('correct');
      setIsEating(true);
      setIsHappy(true);
      triggerParticles();
      setTotalScore(prev => prev + 1);

      // 正解した動物のタワーから、弾（食べ物）を連射！
      fireFoodProjectiles(currentQuestion);

      setTimeout(() => {
        setIsEating(false);
      }, 1500);

      // 1.3秒後に自動的に次の問題へ
      setTimeout(() => {
        nextQuestion();
      }, 1300);
    } else {
      playSound('wrong');
      setShowFeedback('wrong');

      // 1.8秒後に自動でフィードバックを消して再入力可能にする
      setTimeout(() => {
        setShowFeedback(null);
      }, 1800);
    }
  };

  // 10. 食べ物弾の連射発射
  const fireFoodProjectiles = (q: Question) => {
    // 発射数: 掛け算は積 (multiplier * multiplicand), 引き算は引いた数 (multiplicand = あげた数)
    const totalProjectiles = q.mode === 'multiplication'
      ? q.multiplier * q.multiplicand
      : q.multiplicand;

    const startX = ANIMALS[q.animal].towerX;
    const startY = 25;

    setAttackingTower(q.animal);

    let firedCount = 0;
    const interval = setInterval(() => {
      let targetId = -1;
      setEnemies(currEnemies => {
        const alive = currEnemies.filter(e => !e.isSatiated && e.x < 100);
        if (alive.length > 0) {
          const primary = alive.reduce((prev, curr) => prev.x < curr.x ? prev : curr);
          targetId = primary.id;
        }
        return currEnemies;
      });

      const newProj: Projectile = {
        id: Date.now() + firedCount,
        x: startX,
        y: startY,
        targetEnemyId: targetId,
        food: q.food,
        speed: 1.5
      };

      setProjectiles(prev => [...prev, newProj]);
      playSound('shoot');

      firedCount++;
      if (firedCount >= totalProjectiles) {
        clearInterval(interval);
        setTimeout(() => setAttackingTower(null), 300);
      }
    }, 120);
  };

  // 11. 次の問題へ
  const nextQuestion = () => {
    setShowFeedback(null);
    setIsHappy(false);
    setPlacedPlates(0);
    setRemovedIndices([]);
    setQuestionsAnswered(prev => prev + 1);

    const q = generateQuestion(level);
    setCurrentQuestion(q);
  };

  // モード選択後のレベル選択画面へ
  const selectMode = (mode: GameMode) => {
    setGameMode(mode);
    setScreen('level_select');
  };

  return (
    <div className="app-container">
      {/* 音声トグルボタン */}
      <button 
        className="sound-toggle" 
        onClick={() => setAudioEnabled(!audioEnabled)}
        aria-label="おんせい おんおふ"
      >
        {audioEnabled ? '🔊' : '🔇'}
      </button>

      {/* 星パーティクル */}
      {particles.map(p => (
        <span
          key={p.id}
          className="star-particle"
          style={{
            left: `${p.x}px`,
            top: `${p.y}px`,
            color: p.color,
            // @ts-ignore
            '--tx': `${p.tx}px`,
            // @ts-ignore
            '--ty': `${p.ty}px`
          } as React.CSSProperties}
        >
          {p.char}
        </span>
      ))}

      {/* 1. タイトル画面 */}
      {screen === 'title' && (
        <div className="title-screen">
          <div className="title-logo-container">
            <h1 className="title-logo">
              たべもの パズル防衛
              <span>〜オバケから ごちそうを まもろう！〜</span>
            </h1>
          </div>

          <div className="mascot-parade">
            <div className="mascot-img-wrapper">
              <img src={`${BASE_URL}images/rabbit.jpg`} alt="うさぎ" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper" style={{ transform: 'scale(1.1) translateY(-10px)' }}>
              <img src={`${BASE_URL}images/bear.jpg`} alt="くま" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper">
              <img src={`${BASE_URL}images/monkey.jpg`} alt="さる" className="mascot-img" />
            </div>
          </div>

          <button 
            className="btn-kids btn-kids-primary" 
            onClick={() => setScreen('mode_select')}
          >
            あそぶ 🎮
          </button>
        </div>
      )}

      {/* 1-b. 【新画面】モード選択画面 */}
      {screen === 'mode_select' && (
        <div className="mode-select-screen">
          <h2 className="level-title">どちらの モードで あそぶ？</h2>
          
          <div className="mode-grid">
            <div className="mode-card mode-mul" onClick={() => selectMode('multiplication')}>
              <span className="mode-card-icon">🍎✖️</span>
              <span className="mode-card-title">かけざん</span>
              <span className="mode-card-desc">
                お皿をならべて<br />掛け算をするよ！
              </span>
            </div>

            <div className="mode-card mode-sub" onClick={() => selectMode('subtraction')}>
              <span className="mode-card-icon">🥕➖</span>
              <span className="mode-card-title">ひきざん</span>
              <span className="mode-card-desc">
                くだものをタップして消して<br />引き算をするよ！
              </span>
            </div>
          </div>

          <button className="btn-kids" onClick={() => setScreen('title')}>
            もどる ↩️
          </button>
        </div>
      )}

      {/* 2. レベル選択画面 */}
      {screen === 'level_select' && (
        <div className="level-select-screen">
          <h2 className="level-title">むずかしさを えらぼう</h2>
          
          <div className="level-grid">
            <div className="level-card lv-2" onClick={() => startGame(2)}>
              <span className="level-card-icon">🥕</span>
              <span className="level-card-title">かんたん</span>
              <span className="level-card-desc">
                {gameMode === 'multiplication' ? '２の だん' : '５までの ひきざん'}
              </span>
            </div>

            <div className="level-card lv-3" onClick={() => startGame(3)}>
              <span className="level-card-icon">🍎</span>
              <span className="level-card-title">ふつう</span>
              <span className="level-card-desc">
                {gameMode === 'multiplication' ? '３の だん' : '８までの ひきざん'}
              </span>
            </div>

            <div className="level-card lv-5" onClick={() => startGame(5)}>
              <span className="level-card-icon">🍌</span>
              <span className="level-card-title">むずかしい</span>
              <span className="level-card-desc">
                {gameMode === 'multiplication' ? '５の だん' : '１０までの ひきざん'}
              </span>
            </div>

            <div className="level-card lv-random" onClick={() => startGame('random')}>
              <span className="level-card-icon">🌟</span>
              <span className="level-card-title">いろいろ</span>
              <span className="level-card-desc">いろいろ混ざって出るよ！</span>
            </div>
          </div>

          <button className="btn-kids" onClick={() => setScreen('mode_select')}>
            もどる ↩️
          </button>
        </div>
      )}

      {/* 3. ゲームプレイ画面 */}
      {screen === 'playing' && currentQuestion && (
        <div className="game-play-area">
          
          {/* ヘッダー情報 */}
          <div className="game-header">
            <button className="back-btn" onClick={() => setScreen('level_select')}>
              ⬅️ やめる
            </button>
            
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-primary)' }}>
              {gameMode === 'multiplication' ? 'かけざん' : 'ひきざん'} • ウェーブ {wave} / 3
            </div>

            <div className="stats-container">
              <div className="score-badge">
                せいかい: {totalScore}
              </div>

              <div className="lives-display">
                {Array.from({ length: 3 }).map((_, i) => (
                  <span 
                    key={i} 
                    className={`heart-icon ${i >= lives ? 'empty' : ''}`}
                  >
                    {i < lives ? '❤️' : '🖤'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* タワーディフェンス描画エリア */}
          <div className="picnic-road-area">
            <div className="road-path"></div>

            <div className="picnic-tent">
              <span className="picnic-tent-label">ピクニック</span>
            </div>

            {/* 動物ディフェンダー（タワー） */}
            <div className="tower-spot rabbit-tower">
              <img 
                src={`${BASE_URL}images/rabbit.jpg`} 
                alt="うさぎタワー" 
                className={`tower-avatar ${attackingTower === 'rabbit' ? 'attacking' : ''}`} 
              />
              <span className="tower-label">🥕うさぎ</span>
            </div>

            <div className="tower-spot bear-tower">
              <img 
                src={`${BASE_URL}images/bear.jpg`} 
                alt="くまタワー" 
                className={`tower-avatar ${attackingTower === 'bear' ? 'attacking' : ''}`} 
              />
              <span className="tower-label">🍎くま</span>
            </div>

            <div className="tower-spot monkey-tower">
              <img 
                src={`${BASE_URL}images/monkey.jpg`} 
                alt="さるタワー" 
                className={`tower-avatar ${attackingTower === 'monkey' ? 'attacking' : ''}`} 
              />
              <span className="tower-label">🍌さる</span>
            </div>

            {/* 敵いたずらオバケたち */}
            {enemies.map(e => (
              <div 
                key={e.id}
                className="ghost-enemy"
                style={{ 
                  left: `${e.x}%`, 
                  top: `${e.y}px`
                }}
              >
                {!e.isSatiated && (
                  <div className="ghost-hp-bar-container">
                    <div 
                      className={`ghost-hp-bar ${e.hp < e.maxHp / 2 ? 'hungry' : ''}`} 
                      style={{ width: `${(e.hp / e.maxHp) * 100}%` }}
                    ></div>
                  </div>
                )}

                {e.isSatiated && (
                  <span className="ghost-satiated-label">ごちそうさまー！</span>
                )}

                <span className="ghost-body">
                  {e.isSatiated ? '😋' : e.emoji}
                </span>
              </div>
            ))}

            {/* 食べ物弾 */}
            {projectiles.map(p => (
              <img 
                key={p.id}
                src={FOODS[p.food].img}
                alt="くだものだん"
                className="food-projectile"
                style={{
                  left: `${p.x}%`,
                  top: `${p.y}px`
                }}
              />
            ))}
          </div>

          {/* 動物のおねだり吹き出し */}
          <div className="character-section">
            <div className="character-display">
              <img 
                src={ANIMALS[currentQuestion.animal].img} 
                alt={ANIMALS[currentQuestion.animal].name} 
                className={`character-avatar ${isEating ? 'eating' : ''} ${isHappy ? 'happy' : ''}`} 
              />
            </div>
            <div className="speech-bubble">
              <div className="speech-text">
                {gameMode === 'multiplication' ? (
                  // 掛け算おねだり
                  <>
                    {ANIMALS[currentQuestion.animal].name}「
                    <span className="highlight">{FOODS[currentQuestion.food].name}</span> が 
                    <span className="highlight">{currentQuestion.multiplier}こ</span> のったおさらを 
                    <span className="highlight">{currentQuestion.multiplicand}さら</span> ちょうだい！」
                  </>
                ) : (
                  // 引き算おねだり
                  <>
                    {ANIMALS[currentQuestion.animal].name}「
                    <span className="highlight">{FOODS[currentQuestion.food].name}</span> が 
                    <span className="highlight">{currentQuestion.multiplier}こ</span> あるよ！ 
                    オバケに <span className="highlight">{currentQuestion.multiplicand}こ</span> あげたら（引いたら）、のこりは いくつになるかな？」
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 式とテーブル */}
          <div className="workspace-section">
            {/* 数式 (動的プレビュー) */}
            <div className={`formula-display ${showFeedback === 'correct' ? 'correct-highlight' : ''}`}>
              {gameMode === 'multiplication' ? (
                // 掛け算
                <>
                  <div className="num-box target">{currentQuestion.multiplier}</div>
                  <div>×</div>
                  <div className="num-box target">
                    {showFeedback === 'correct' ? currentQuestion.multiplicand : placedPlates}
                  </div>
                  <div>＝</div>
                  <div className="num-box answer">
                    {showFeedback === 'correct' 
                      ? currentQuestion.multiplier * currentQuestion.multiplicand 
                      : currentQuestion.multiplier * placedPlates}
                  </div>
                </>
              ) : (
                // 引き算 (minuend - subtrahend = difference)
                // プレビュー: 最初 {multiplier} - 消した数 {removedIndices.length} = 残り
                <>
                  <div className="num-box target">{currentQuestion.multiplier}</div>
                  <div>－</div>
                  <div className="num-box target">
                    {showFeedback === 'correct' ? currentQuestion.multiplicand : removedIndices.length}
                  </div>
                  <div>＝</div>
                  <div className="num-box answer">
                    {showFeedback === 'correct' 
                      ? currentQuestion.multiplier - currentQuestion.multiplicand 
                      : currentQuestion.multiplier - removedIndices.length}
                  </div>
                </>
              )}
            </div>

            {/* お皿テーブル */}
            <div className={`table-area ${showFeedback === 'correct' ? 'correct-highlight' : ''}`}>
              {gameMode === 'multiplication' ? (
                // 掛け算テーブル (お皿を並べる)
                <>
                  {placedPlates === 0 && (
                    <div className="table-placeholder">
                      下のおさらを タップして テーブルに ならべてね！<br />
                      せいかいすると 果物が飛んでいって オバケを満腹にするよ！
                    </div>
                  )}
                  {Array.from({ length: placedPlates }).map((_, i) => (
                    <div 
                      key={i} 
                      className="plate-item"
                      onClick={removePlate}
                      title="タップでおさらをかたづける"
                    >
                      <div className="plate-index-badge">{i + 1}</div>
                      <div className="plate-food-grid">
                        {Array.from({ length: currentQuestion.multiplier }).map((_, foodIdx) => (
                          <img 
                            key={foodIdx} 
                            src={FOODS[currentQuestion.food].img} 
                            alt={FOODS[currentQuestion.food].name} 
                            className="food-icon-small"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                // 引き算テーブル (最初から果物が並んでいて、タップして消す)
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', width: '100%' }}>
                  {removedIndices.length === 0 && (
                    <div className="table-placeholder" style={{ marginBottom: '5px' }}>
                      おさらの中の くだものを タップして、オバケにあげる分（{currentQuestion.multiplicand}こ）だけ 消してね！
                    </div>
                  )}
                  <div className="subtraction-plate">
                    <div className="plate-food-grid" style={{ width: '85%', height: '85%' }}>
                      {Array.from({ length: currentQuestion.multiplier }).map((_, idx) => {
                        const isRemoved = removedIndices.includes(idx);
                        return (
                          <img
                            key={idx}
                            src={FOODS[currentQuestion.food].img}
                            alt={FOODS[currentQuestion.food].name}
                            className={`sub-food-item ${isRemoved ? 'removed' : ''}`}
                            onClick={() => toggleRemoveItem(idx)}
                            title="タップして消す/もどす"
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 操作棚 */}
          <div className="control-section">
            <div className="interactive-shelf">
              {gameMode === 'multiplication' ? (
                // かけざん用棚
                <>
                  <div className="shelf-item-container">
                    <button 
                      className="btn-shelf-plate" 
                      onClick={addPlate}
                      aria-label="おさらを追加"
                    >
                      <div className="plate-food-grid" style={{ width: '60%', height: '60%' }}>
                        {Array.from({ length: currentQuestion.multiplier }).map((_, foodIdx) => (
                          <img 
                            key={foodIdx} 
                            src={FOODS[currentQuestion.food].img} 
                            alt={FOODS[currentQuestion.food].name} 
                            className="food-icon-small"
                          />
                        ))}
                      </div>
                    </button>
                    <div className="shelf-label">おさらを ならべる</div>
                  </div>
                  
                  {placedPlates > 0 && (
                    <div className="shelf-item-container">
                      <button 
                        className="btn-kids btn-kids-accent"
                        onClick={removePlate}
                        style={{ padding: '8px 18px', fontSize: '1rem', borderRadius: '15px' }}
                      >
                        １さら かたづける
                      </button>
                    </div>
                  )}
                </>
              ) : (
                // ひきざん用棚
                <div className="shelf-item-container">
                  <button 
                    className="btn-kids btn-kids-accent" 
                    onClick={() => { setRemovedIndices([]); playSound('remove'); }}
                    disabled={removedIndices.length === 0}
                    style={{ opacity: removedIndices.length === 0 ? 0.6 : 1, padding: '12px 24px' }}
                  >
                    🔄 ぜんぶ 元にもどす
                  </button>
                  <div className="shelf-label">くだものを 最初からやりなおす</div>
                </div>
              )}
            </div>

            <div className="action-buttons">
              <button 
                className="btn-kids btn-kids-success" 
                onClick={checkAnswer}
                disabled={gameMode === 'multiplication' ? placedPlates === 0 : false}
                style={{ 
                  opacity: (gameMode === 'multiplication' && placedPlates === 0) ? 0.6 : 1 
                }}
              >
                できた！ 😋
              </button>
            </div>
          </div>

          {/* 簡易お知らせ用フィードバック表示 */}
          {showFeedback && (
            <div className="quick-feedback-overlay">
              {showFeedback === 'correct' ? (
                <>
                  <div className="quick-feedback-text" style={{ color: 'var(--color-success)' }}>
                    💮 せいかい！
                  </div>
                  <div className="quick-feedback-sub">
                    {gameMode === 'multiplication' ? (
                      <>{currentQuestion.multiplier} × {currentQuestion.multiplicand} ＝ {currentQuestion.multiplier * currentQuestion.multiplicand}</>
                    ) : (
                      <>{currentQuestion.multiplier} － {currentQuestion.multiplicand} ＝ {currentQuestion.multiplier - currentQuestion.multiplicand}</>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="quick-feedback-text" style={{ color: 'var(--color-accent)' }}>
                    🤔 あれれ？
                  </div>
                  <div className="quick-feedback-sub">
                    {gameMode === 'multiplication' 
                      ? 'お皿の数がちがうよ！もういちど数えよう！' 
                      : `オバケにあげる分（${currentQuestion.multiplicand}こ）だけタップして消してね！`}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. ゲームクリア画面 */}
      {screen === 'clear' && (
        <div className="clear-screen">
          <h1 className="clear-title">🌟 かんぜんクリア！ 🌟</h1>
          <p className="clear-subtitle">どうぶつたちが ごちそうを まもりきったよ！</p>
          
          <div className="clear-mascot-dance">
            <div className="mascot-img-wrapper">
              <img src={`${BASE_URL}images/rabbit.jpg`} alt="うさぎ" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper" style={{ width: '140px', height: '140px', transform: 'translateY(-10px)' }}>
              <img src={`${BASE_URL}images/bear.jpg`} alt="くま" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper">
              <img src={`${BASE_URL}images/monkey.jpg`} alt="さる" className="mascot-img" />
            </div>
          </div>

          <div className="clear-stats">
            <div>{gameMode === 'multiplication' ? 'かけざん' : 'ひきざん'}の ウェーブ３を防衛完了！</div>
            <div style={{ marginTop: '8px', fontSize: '1.1rem' }}>といた もんだい: {questionsAnswered} もん</div>
            <div className="clear-star-reward">
              {Array.from({ length: Math.min(totalScore, 5) }).map((_, i) => (
                <span key={i}>⭐</span>
              ))}
            </div>
          </div>

          <button className="btn-kids btn-kids-primary" onClick={() => setScreen('title')}>
            タイトルへ もどる 🏠
          </button>
        </div>
      )}

      {/* 5. ゲームオーバー画面 */}
      {screen === 'gameover' && (
        <div className="clear-screen">
          <h1 className="clear-title" style={{ color: 'var(--color-accent)' }}>💦 ゲームオーバー 💦</h1>
          <p className="clear-subtitle">オバケに ごちそうを たべられちゃった！</p>
          
          <div className="clear-mascot-dance" style={{ filter: 'grayscale(0.5)' }}>
            <div className="mascot-img-wrapper">
              <img src={`${BASE_URL}images/rabbit.jpg`} alt="うさぎ" className="mascot-img" style={{ transform: 'rotate(-10deg)' }} />
            </div>
            <div className="mascot-img-wrapper" style={{ width: '140px', height: '140px' }}>
              <img src={`${BASE_URL}images/bear.jpg`} alt="くま" className="mascot-img" style={{ transform: 'scale(1.05)' }} />
            </div>
            <div className="mascot-img-wrapper">
              <img src={`${BASE_URL}images/monkey.jpg`} alt="さる" className="mascot-img" style={{ transform: 'rotate(10deg)' }} />
            </div>
          </div>

          <div className="clear-stats">
            <div>とちゅうで ライフが なくなっちゃったよ</div>
            <div style={{ marginTop: '8px', fontSize: '1.1rem' }}>といた もんだい: {questionsAnswered} もん</div>
            <div>つぎは がんばろう！</div>
          </div>

          <button className="btn-kids btn-kids-primary" onClick={() => setScreen('title')}>
            タイトルへ もどる 🏠
          </button>
        </div>
      )}

      <p className="footer-text">たべもの かけざん • ひきざん - 5さいからの知育パズル</p>
    </div>
  );
}

export default App;
