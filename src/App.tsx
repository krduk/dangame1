import { useState, useRef } from 'react';
import './App.css';

// 定数定義
const ANIMALS = {
  rabbit: { name: 'うさぎさん', img: '/images/rabbit.jpg', color: '#ff7f50' },
  bear: { name: 'くまさん', img: '/images/bear.jpg', color: '#ffb703' },
  monkey: { name: 'さるさん', img: '/images/monkey.jpg', color: '#1982c4' }
};

const FOODS = {
  carrot: { name: 'にんじん', emoji: '🥕', img: '/images/carrot.jpg' },
  apple: { name: 'りんご', emoji: '🍎', img: '/images/apple.jpg' },
  banana: { name: 'バナナ', emoji: '🍌', img: '/images/banana.jpg' }
};

type Level = 2 | 3 | 5 | 'random';

interface Question {
  multiplier: number;   // 1皿あたりの個数
  multiplicand: number; // 皿の数
  food: keyof typeof FOODS;
  animal: keyof typeof ANIMALS;
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
  // アプリの状態
  const [screen, setScreen] = useState<'title' | 'level_select' | 'playing' | 'clear'>('title');
  const [level, setLevel] = useState<Level>(2);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [placedPlates, setPlacedPlates] = useState<number>(0);
  const [showFeedback, setShowFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [isEating, setIsEating] = useState<boolean>(false);
  const [isHappy, setIsHappy] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [totalScore, setTotalScore] = useState<number>(0);

  // キャンバス/音声用のRef
  const audioCtxRef = useRef<AudioContext | null>(null);

  // 効果音再生
  const playSound = (type: 'plate' | 'correct' | 'wrong' | 'clear' | 'remove') => {
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
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'remove') {
        // お皿を消した音
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
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
        // ファンファーレ！ (Cコード -> Fコード -> Gコード -> Cコード)
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
            osc.frequency.setValueAtTime(freq, now + chordIdx * 0.25);
            
            const duration = chordIdx === 3 ? 0.8 : 0.2;
            gain.gain.setValueAtTime(0.08, now + chordIdx * 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, now + chordIdx * 0.25 + duration);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + chordIdx * 0.25);
            osc.stop(now + chordIdx * 0.25 + duration);
          });
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 星吹雪パーティクル生成
  const triggerParticles = () => {
    const newParticles: Particle[] = [];
    const colors = ['#ff7f50', '#ffb703', '#8ac926', '#1982c4', '#ff5964', '#ff70a6'];
    const shapes = ['★', '🌸', '✨', '🎈', '🍀', '🍎', '🥕', '🍌'];
    
    // 画面中央付近から飛び散らせる
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 250;
      newParticles.push({
        id: Date.now() + i,
        x: window.innerWidth / 2,
        y: window.innerHeight / 3,
        tx: Math.cos(angle) * speed,
        ty: Math.sin(angle) * speed - 100, // 上方に少し飛ぶように
        char: shapes[Math.floor(Math.random() * shapes.length)],
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
    setParticles(newParticles);
    // 1.5秒後に消す
    setTimeout(() => {
      setParticles([]);
    }, 1500);
  };

  // ゲーム開始：問題を作成する
  const startGame = (selectedLevel: Level) => {
    setLevel(selectedLevel);
    
    const newQuestions: Question[] = [];
    const animals: (keyof typeof ANIMALS)[] = ['rabbit', 'bear', 'monkey'];

    for (let i = 0; i < 5; i++) {
      let multiplier = 2; // 1皿あたりの個数
      let food: keyof typeof FOODS = 'carrot';

      if (selectedLevel === 'random') {
        const rand = Math.floor(Math.random() * 3);
        if (rand === 0) {
          multiplier = 2;
          food = 'carrot';
        } else if (rand === 1) {
          multiplier = 3;
          food = 'apple';
        } else {
          multiplier = 5;
          food = 'banana';
        }
      } else {
        multiplier = selectedLevel;
        if (selectedLevel === 2) food = 'carrot';
        if (selectedLevel === 3) food = 'apple';
        if (selectedLevel === 5) food = 'banana';
      }

      // 掛ける数（皿の数）: 1〜5 (5歳児向けに掛けた結果が極力20以下になるように設定)
      // 5の段なら1〜4、2や3の段なら1〜5
      const maxMultiplicand = multiplier === 5 ? 4 : 5;
      const multiplicand = Math.floor(Math.random() * maxMultiplicand) + 1;
      
      const animal = animals[Math.floor(Math.random() * animals.length)];

      newQuestions.push({
        multiplier,
        multiplicand,
        food,
        animal
      });
    }

    setQuestions(newQuestions);
    setCurrentIdx(0);
    setPlacedPlates(0);
    setShowFeedback(null);
    setIsEating(false);
    setIsHappy(false);
    setTotalScore(0);
    setScreen('playing');
  };

  const currentQuestion = questions[currentIdx];

  // お皿を追加する
  const addPlate = () => {
    if (showFeedback) return;
    // 5歳向けに最大皿数を6までに制限（画面に並びきらなくなるのを防ぐ）
    if (placedPlates >= 6) return;

    setPlacedPlates(prev => prev + 1);
    playSound('plate');
  };

  // お皿を取り除く
  const removePlate = () => {
    if (showFeedback) return;
    if (placedPlates <= 0) return;

    setPlacedPlates(prev => prev - 1);
    playSound('remove');
  };

  // 答え合わせ
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

      // 1.8秒後にもぐもぐを終了し、次のステップへ進める状態にする
      setTimeout(() => {
        setIsEating(false);
      }, 1500);
    } else {
      playSound('wrong');
      setShowFeedback('wrong');
    }
  };

  // 次の問題へ
  const nextQuestion = () => {
    setShowFeedback(null);
    setIsHappy(false);
    setPlacedPlates(0);

    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(prev => prev + 1);
    } else {
      // 全問終了
      playSound('clear');
      setScreen('clear');
    }
  };

  // 最初からやり直す
  const handleBackToTitle = () => {
    setScreen('title');
  };

  return (
    <div className="app-container">
      {/* 音声オンオフボタン */}
      <button 
        className="sound-toggle" 
        onClick={() => setAudioEnabled(!audioEnabled)}
        aria-label="おんせい おんおふ"
      >
        {audioEnabled ? '🔊' : '🔇'}
      </button>

      {/* パーティクル表示 */}
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
              <span>〜どうぶつたちに ごちそうしよう！〜</span>
            </h1>
          </div>

          <div className="mascot-parade">
            <div className="mascot-img-wrapper">
              <img src="/images/rabbit.jpg" alt="うさぎ" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper" style={{ transform: 'scale(1.1) translateY(-10px)' }}>
              <img src="/images/bear.jpg" alt="くま" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper">
              <img src="/images/monkey.jpg" alt="さる" className="mascot-img" />
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
              <span className="level-card-desc">にんじんを ２こずつ 配るよ</span>
            </div>

            <div className="level-card lv-3" onClick={() => startGame(3)}>
              <span className="level-card-icon">🍎</span>
              <span className="level-card-title">３の だん</span>
              <span className="level-card-desc">りんごを ３こずつ 配るよ</span>
            </div>

            <div className="level-card lv-5" onClick={() => startGame(5)}>
              <span className="level-card-icon">🍌</span>
              <span className="level-card-title">５の だん</span>
              <span className="level-card-desc">バナナを ５こずつ 配るよ</span>
            </div>

            <div className="level-card lv-random" onClick={() => startGame('random')}>
              <span className="level-card-icon">🌟</span>
              <span className="level-card-title">いろいろ</span>
              <span className="level-card-desc">ランダムに もんだいが 出るよ</span>
            </div>
          </div>

          <button className="btn-kids" onClick={handleBackToTitle}>
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
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)' }}>
              {level === 'random' ? 'いろいろ' : `${level}の だん`}
            </div>
            <div className="progress-container">
              {questions.map((_, index) => (
                <span 
                  key={index} 
                  className={`progress-star ${index <= currentIdx ? 'active' : ''}`}
                >
                  {index < currentIdx ? '⭐' : index === currentIdx ? '⭐' : '☆'}
                </span>
              ))}
            </div>
          </div>

          {/* 動物と吹き出し */}
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

          {/* ワークスペース (式とテーブル) */}
          <div className="workspace-section">
            {/* かけざんの式表示 */}
            <div className="formula-display">
              {/* 1つのお皿に乗せる数 */}
              <div className="num-box target">{currentQuestion.multiplier}</div>
              <div>×</div>
              {/* 欲しいお皿の数（正解したらお皿の数を表示、未回答なら？マーク） */}
              <div className="num-box target">
                {showFeedback === 'correct' ? currentQuestion.multiplicand : '?'}
              </div>
              <div>＝</div>
              {/* 合計の数 */}
              <div className="num-box answer">
                {showFeedback === 'correct' 
                  ? currentQuestion.multiplier * currentQuestion.multiplicand 
                  : '?'}
              </div>
            </div>

            {/* お皿を並べるテーブル */}
            <div className="table-area">
              {placedPlates === 0 && (
                <div className="table-placeholder">
                  下のおさらを タップして テーブルに ならべてね！
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
                  <div className={`plate-food-grid grid-${currentQuestion.multiplier}`}>
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

          {/* 操作棚とアクションボタン */}
          <div className="control-section">
            <div className="interactive-shelf">
              <div className="shelf-item-container">
                <button 
                  className="btn-shelf-plate" 
                  onClick={addPlate}
                  aria-label="おさらを追加"
                >
                  <div className={`plate-food-grid grid-${currentQuestion.multiplier}`} style={{ width: '60%', height: '60%' }}>
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
                    style={{ padding: '10px 20px', fontSize: '1.1rem', borderRadius: '15px' }}
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
          <h1 className="clear-title">🌟 おめでとう！ 🌟</h1>
          <p className="clear-subtitle">どうぶつたちが おなかいっぱいになったよ！</p>
          
          <div className="clear-mascot-dance">
            <div className="mascot-img-wrapper">
              <img src="/images/rabbit.jpg" alt="うさぎ" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper" style={{ width: '140px', height: '140px', transform: 'translateY(-10px)' }}>
              <img src="/images/bear.jpg" alt="くま" className="mascot-img" />
            </div>
            <div className="mascot-img-wrapper">
              <img src="/images/monkey.jpg" alt="さる" className="mascot-img" />
            </div>
          </div>

          <div className="clear-stats">
            <div>ぜんぶで {questions.length}もちゅう {totalScore}もん せいかい！</div>
            <div className="clear-star-reward">
              {Array.from({ length: totalScore }).map((_, i) => (
                <span key={i}>⭐</span>
              ))}
            </div>
          </div>

          <button className="btn-kids btn-kids-primary" onClick={handleBackToTitle}>
            タイトルへ もどる 🏠
          </button>
        </div>
      )}

      <p className="footer-text">たべもの かけざん - 5さいからの かけざんレッスン</p>
    </div>
  );
}

export default App;
