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

interface Question {
  multiplier: number;   // 1皿あたりの個数
  multiplicand: number; // 皿の数
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
  isSatiated: boolean; // 満腹になって満足して帰る状態か
  satiatedTimer: number; // 「ごちそうさま」表示用
}

interface Projectile {
  id: number;
  x: number; // 現在位置 X %
  y: number; // 現在位置 Y px
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
  // 画面遷移
  const [screen, setScreen] = useState<'title' | 'level_select' | 'playing' | 'clear' | 'gameover'>('title');
  const [level, setLevel] = useState<Level>(2);
  
  // タワーディフェンス関係の状態
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [lives, setLives] = useState<number>(3);
  const [wave, setWave] = useState<number>(1);
  const [waveActive, setWaveActive] = useState<boolean>(false);
  const [attackingTower, setAttackingTower] = useState<keyof typeof ANIMALS | null>(null);

  // 掛け算レッスン関係の状態
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [lastQuestions, setLastQuestions] = useState<string[]>([]); // 重複防止用履歴
  const [placedPlates, setPlacedPlates] = useState<number>(0);
  const [showFeedback, setShowFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [isEating, setIsEating] = useState<boolean>(false);
  const [isHappy, setIsHappy] = useState<boolean>(false);
  const [totalScore, setTotalScore] = useState<number>(0);
  const [questionsAnswered, setQuestionsAnswered] = useState<number>(0); // 今回のゲームで解いた問題数
  
  // オーディオとエフェクト
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [particles, setParticles] = useState<Particle[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 1. 効果音ジェネレーター (Web Audio API)
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
        // お皿をポンと置いた音
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
        // お皿を片付けた音
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
        // 食べ物を発射した音 (ピョン！)
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
        // 敵に食べ物が当たった音 (ポフッ)
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
        // テントに敵が侵入した時のダメージ音 (ドスン！)
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
        // 正解音: ピピピピーン！ (C5 -> E5 -> G5 -> C6)
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
        // 不正解音: ブブー
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
        // ファンファーレ！
        const chords = [
          [261.63, 329.63, 392.00], // C4, E4, G4
          [349.23, 440.00, 523.25], // F4, A4, C5
          [392.00, 493.88, 587.33], // G4, B4, D5
          [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6
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

  // 3. 掛け算問題生成 (重複防止ロジック付き)
  const generateQuestion = (selectedLevel: Level): Question => {
    const animalsList: (keyof typeof ANIMALS)[] = ['rabbit', 'bear', 'monkey'];
    let multiplier = 2;
    let food: keyof typeof FOODS = 'carrot';

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

    // 重複のない「掛ける数 (1〜5、5の段なら1〜4)」を探す
    const maxMultiplicand = multiplier === 5 ? 4 : 5;
    let multiplicand = 1;
    let attempts = 0;
    
    while (attempts < 15) {
      multiplicand = Math.floor(Math.random() * maxMultiplicand) + 1;
      const questionKey = `${multiplier}*${multiplicand}`;
      if (!lastQuestions.includes(questionKey)) {
        // 重複なし。履歴に追加（直近3問を記憶）
        const newHistory = [...lastQuestions, questionKey];
        if (newHistory.length > 3) newHistory.shift();
        setLastQuestions(newHistory);
        break;
      }
      attempts++;
    }

    const animal = animalsList[Math.floor(Math.random() * animalsList.length)];
    return { multiplier, multiplicand, food, animal };
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
    setShowFeedback(null);
    setIsEating(false);
    setIsHappy(false);
    setScreen('playing');

    // 最初のウェーブの敵を出す
    spawnWaveEnemies(1);

    // 最初の問題をセット
    // ※ generateQuestionに一時的な空履歴を渡す代わりに引数はlevelのみ
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

    // ウェーブごとの敵の数 (3, 5, 7)
    const enemyCount = waveNum * 2 + 1;

    for (let i = 0; i < enemyCount; i++) {
      // くいしんぼうオニ(ボス)はウェーブ3の最後に1体だけ出す
      const type = (waveNum === 3 && i === enemyCount - 1) 
        ? 'fat' 
        : types[Math.floor(Math.random() * types.length)];
      
      const config = GHOST_TYPES[type];

      newEnemies.push({
        id: Date.now() + i,
        x: 100 + i * 20, // 右端の外側から順次登場させる
        y: 65 + (i % 2) * 12, // 道の上下に少し散らす
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

  // 6. メインゲームループ (オバケの進行と弾の移動・当たり判定)
  useEffect(() => {
    if (screen !== 'playing') return;
    
    // 正解アニメーション表示中（ポーズ中）は敵や弾の動作を止める
    if (showFeedback === 'correct') return;

    const interval = setInterval(() => {
      // 6-a. 敵の移動処理
      setEnemies(prevEnemies => {
        let reachedGoal = false;
        const updated = prevEnemies.map(enemy => {
          if (enemy.isSatiated) {
            // 満腹マーク表示時間を進める
            if (enemy.satiatedTimer > 0) {
              return { ...enemy, satiatedTimer: enemy.satiatedTimer - 50 };
            }
            return null; // 表示時間が切れたら削除
          }

          const nextX = enemy.x - enemy.speed;
          if (nextX <= 15) {
            reachedGoal = true; // 左端のテントに到達
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

      // 6-b. 弾の移動と当たり判定
      setProjectiles(prevProjectiles => {
        const nextProjectiles: Projectile[] = [];

        prevProjectiles.forEach(p => {
          // ターゲットの敵を探す
          let target: Enemy | undefined;
          setEnemies(currentEnemies => {
            target = currentEnemies.find(e => e.id === p.targetEnemyId && !e.isSatiated);
            return currentEnemies;
          });

          // ターゲットが既にいない場合、一番左の生存している敵を再追尾
          if (!target) {
            setEnemies(currentEnemies => {
              const alive = currentEnemies.filter(e => !e.isSatiated && e.x < 100);
              if (alive.length > 0) {
                // 最も進んでいる（x座標が小さい）敵
                target = alive.reduce((prev, curr) => prev.x < curr.x ? prev : curr);
              }
              return currentEnemies;
            });
          }

          if (target) {
            // ターゲットに向かって弾を進める (x: %, y: px)
            const targetX = target.x;
            const targetY = target.y;

            const dx = targetX - p.x;
            const dy = targetY - p.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 4) {
              // 衝突した！
              playSound('hit');
              const hitId = target.id;
              
              // 敵にダメージ（満腹度追加）
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
              // この弾は消滅するので nextProjectiles に追加しない
            } else {
              // ターゲットに向かって移動
              const stepX = (dx / distance) * p.speed;
              const stepY = (dy / distance) * (p.speed * 2.5); // Y方向のスケール補正
              nextProjectiles.push({
                ...p,
                x: p.x + stepX,
                y: p.y + stepY
              });
            }
          } else {
            // 画面外にそのまま直進
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

  // 7. ウェーブクリア・敵全滅チェック
  useEffect(() => {
    if (!waveActive || enemies.length > 0 || screen !== 'playing') return;

    // 生存している敵が全て満腹退散した場合
    setWaveActive(false);
    if (wave < 3) {
      // 次のウェーブへ進む
      setWave(prev => prev + 1);
      spawnWaveEnemies(wave + 1);
      playSound('clear');
    } else {
      // 全ウェーブクリア！ゲーム勝利
      playSound('clear');
      setScreen('clear');
    }
  }, [enemies, waveActive, wave, screen]);

  // 8. お皿の追加と削除
  const addPlate = () => {
    if (showFeedback) return;
    if (placedPlates >= 6) return; // 最大6皿制限

    setPlacedPlates(prev => prev + 1);
    playSound('plate');
  };

  const removePlate = () => {
    if (showFeedback) return;
    if (placedPlates <= 0) return;

    setPlacedPlates(prev => prev - 1);
    playSound('remove');
  };

  // 9. 答え合わせ ＆ 攻撃開始
  const checkAnswer = () => {
    if (showFeedback || !currentQuestion) return;

    const isCorrect = placedPlates === currentQuestion.multiplicand;

    if (isCorrect) {
      playSound('correct');
      setShowFeedback('correct');
      setIsEating(true);
      setIsHappy(true);
      triggerParticles();
      setTotalScore(prev => prev + 1);

      // 正解した動物のタワーから、弾（食べ物）を「掛け算の総数」分だけ発射！
      fireFoodProjectiles(currentQuestion);

      setTimeout(() => {
        setIsEating(false);
      }, 1500);
    } else {
      playSound('wrong');
      setShowFeedback('wrong');
    }
  };

  // 10. 食べ物弾の発射（ダダダダダッと連続発射する演出）
  const fireFoodProjectiles = (q: Question) => {
    const totalProjectiles = q.multiplier * q.multiplicand;
    const startX = ANIMALS[q.animal].towerX;
    const startY = 25; // 道の上

    setAttackingTower(q.animal);

    // 連射ディレイ処理
    let firedCount = 0;
    const interval = setInterval(() => {
      // 画面内に残っている「まだ満腹になっていない」かつ「登場している(x<100)」オバケを取得
      let targetId = -1;
      setEnemies(currEnemies => {
        const alive = currEnemies.filter(e => !e.isSatiated && e.x < 100);
        if (alive.length > 0) {
          // 最も左に進んでいる敵を最優先ターゲットにする
          const primary = alive.reduce((prev, curr) => prev.x < curr.x ? prev : curr);
          targetId = primary.id;
        }
        return currEnemies;
      });

      // 弾を作成
      const newProj: Projectile = {
        id: Date.now() + firedCount,
        x: startX,
        y: startY,
        targetEnemyId: targetId,
        food: q.food,
        speed: 1.5 // 移動速度
      };

      setProjectiles(prev => [...prev, newProj]);
      playSound('shoot');

      firedCount++;
      if (firedCount >= totalProjectiles) {
        clearInterval(interval);
        setTimeout(() => setAttackingTower(null), 300); // 攻撃モーション終了
      }
    }, 120); // 120ms間隔で発射
  };

  // 11. 次の問題へ
  const nextQuestion = () => {
    setShowFeedback(null);
    setIsHappy(false);
    setPlacedPlates(0);
    setQuestionsAnswered(prev => prev + 1);

    // 次の問題を生成してセット
    const q = generateQuestion(level);
    setCurrentQuestion(q);
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
              たべもの かけざん
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
            onClick={() => setScreen('level_select')}
          >
            あそぶ 🎮
          </button>
        </div>
      )}

      {/* 2. レベル選択画面 */}
      {screen === 'level_select' && (
        <div className="level-select-screen">
          <h2 className="level-title">どの だんで あそぶ？</h2>
          
          <div className="level-grid">
            <div className="level-card lv-2" onClick={() => startGame(2)}>
              <span className="level-card-icon">🥕</span>
              <span className="level-card-title">２の だん</span>
              <span className="level-card-desc">にんじんバズーカ (2発)</span>
            </div>

            <div className="level-card lv-3" onClick={() => startGame(3)}>
              <span className="level-card-icon">🍎</span>
              <span className="level-card-title">３の だん</span>
              <span className="level-card-desc">りんごバズーカ (3発)</span>
            </div>

            <div className="level-card lv-5" onClick={() => startGame(5)}>
              <span className="level-card-icon">🍌</span>
              <span className="level-card-title">５の だん</span>
              <span className="level-card-desc">バナナバズーカ (5発)</span>
            </div>

            <div className="level-card lv-random" onClick={() => startGame('random')}>
              <span className="level-card-icon">🌟</span>
              <span className="level-card-title">いろいろ</span>
              <span className="level-card-desc">いろいろ混ざって出るよ！</span>
            </div>
          </div>

          <button className="btn-kids" onClick={() => setScreen('title')}>
            もどる ↩️
          </button>
        </div>
      )}

      {/* 3. ゲームプレイ画面 (タワーディフェンス + かけざん) */}
      {screen === 'playing' && currentQuestion && (
        <div className="game-play-area">
          
          {/* ヘッダー情報 */}
          <div className="game-header">
            <button className="back-btn" onClick={() => setScreen('level_select')}>
              ⬅️ やめる
            </button>
            
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)' }}>
              ウェーブ {wave} / 3
            </div>

            <div className="stats-container">
              {/* スコア表示 */}
              <div className="score-badge">
                せいかい: {totalScore}
              </div>

              {/* ライフ（ハート）表示 */}
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

          {/* ==========================================
              【新要素】タワーディフェンス描画エリア
              ========================================== */}
          <div className="picnic-road-area">
            {/* 道 */}
            <div className="road-path"></div>

            {/* 左端の防衛テント */}
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
                {/* 満腹ゲージ */}
                {!e.isSatiated && (
                  <div className="ghost-hp-bar-container">
                    <div 
                      className={`ghost-hp-bar ${e.hp < e.maxHp / 2 ? 'hungry' : ''}`} 
                      style={{ width: `${(e.hp / e.maxHp) * 100}%` }}
                    ></div>
                  </div>
                )}

                {/* 満腹マーク */}
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
                {ANIMALS[currentQuestion.animal].name}「
                <span className="highlight">{FOODS[currentQuestion.food].name}</span> が 
                <span className="highlight">{currentQuestion.multiplier}こ</span> のったおさらを 
                <span className="highlight">{currentQuestion.multiplicand}さら</span> ちょうだい！」
              </div>
            </div>
          </div>

          {/* 式とテーブル */}
          <div className="workspace-section">
            <div className="formula-display">
              <div className="num-box target">{currentQuestion.multiplier}</div>
              <div>×</div>
              <div className="num-box target">
                {showFeedback === 'correct' ? currentQuestion.multiplicand : '?'}
              </div>
              <div>＝</div>
              <div className="num-box answer">
                {showFeedback === 'correct' 
                  ? currentQuestion.multiplier * currentQuestion.multiplicand 
                  : '?'}
              </div>
            </div>

            {/* お皿テーブル (はみ出しバグ修正版) */}
            <div className="table-area">
              {placedPlates === 0 && (
                <div className="table-placeholder">
                  下のおさらを タップして テーブルに ならべてね！<br />
                  せいかいすると くだものが 飛んでいって オバケを満腹にするよ！
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
            </div>
          </div>

          {/* 操作棚 */}
          <div className="control-section">
            <div className="interactive-shelf">
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
            </div>

            <div className="action-buttons">
              <button 
                className="btn-kids btn-kids-success" 
                onClick={checkAnswer}
                disabled={placedPlates === 0}
                style={{ opacity: placedPlates === 0 ? 0.6 : 1 }}
              >
                できた！ 😋
              </button>
            </div>
          </div>

          {/* 正解/不正解時のオーバーレイ */}
          {showFeedback && (
            <div className="feedback-overlay">
              {showFeedback === 'correct' ? (
                <>
                  <div className="feedback-stamp correct">💮</div>
                  <div className="feedback-text">
                    せいかい！<br />
                    {currentQuestion.multiplier} × {currentQuestion.multiplicand} ＝ {currentQuestion.multiplier * currentQuestion.multiplicand}<br />
                    （{Array.from({ length: currentQuestion.multiplicand }).map(() => currentQuestion.multiplier).join(' ＋ ')} ＝ {currentQuestion.multiplier * currentQuestion.multiplicand}）
                  </div>
                  <button className="btn-kids btn-kids-primary" onClick={nextQuestion}>
                    つぎの もんだい ➡️
                  </button>
                </>
              ) : (
                <>
                  <div className="feedback-stamp wrong">🤔</div>
                  <div className="feedback-text">
                    あれれ？ おさらが {placedPlates > currentQuestion.multiplicand ? 'おおい' : 'すくない'}よ！<br />
                    もういちど かぞえてみよう！
                  </div>
                  <button className="btn-kids" onClick={() => setShowFeedback(null)}>
                    やりなおす ↩️
                  </button>
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
            <div>ウェーブ３を 全て防衛完了！</div>
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

      <p className="footer-text">たべもの かけざん - 5さいからの かけざんレッスン</p>
    </div>
  );
}

export default App;
