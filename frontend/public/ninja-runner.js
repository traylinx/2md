/**
 * NinjaRunner — Astro-Ninja: Stargate Protocol (True Edition)
 * Pixel-art T-Rex style runner with 3-phase progression,
 * VFX (screen shake, VHS glitch, wormhole), and fullscreen dialog.
 * Auto-initializes on all pages with .top-nav
 */
class NinjaRunner {
    constructor(containerSelector, options = {}) {
        this.container = document.querySelector(containerSelector);
        if (!this.container) return;

        this.options = {
            speed: options.speed || 6,
            gravity: options.gravity || 0.6,
            jumpStrength: options.jumpStrength || -12,
            ...options
        };
        this.baseGravity = this.options.gravity;

        this.canvas = document.createElement('canvas');
        this.canvas.style.pointerEvents = 'auto';
        this.ctx = this.canvas.getContext('2d');
        this.container.appendChild(this.canvas);

        this.isDarkMode = true;
        this.color = '#ffffff';
        this.audioCtx = null;
        this.musicGain = null;
        this.musicNextAt = 0;
        this.musicStep = 0;
        this.musicBar = 0;

        this.stars = [];
        this.groundBumps = [];
        this.particles = [];

        // Phase & VFX state
        this.currentPhase = 1;
        this.screenShake = 0;
        this.isGlitching = false;
        this.warpRingRadius = 0;
        this.phaseFlashText = '';
        this.phaseFlashAlpha = 0;

        // Fullscreen dialog state
        this.isFullscreen = false;
        this.dialogOverlay = null;
        this.originalContainer = null;

        // Extended mode state (fullscreen only)
        this.gameMode = 'header';
        this.playerState = 'running';
        this.weapon = { ammo: 0, active: false };
        this.projectiles = [];
        this.pickups = [];
        this.ufo = { active: false, timer: 0, health: 1 };
        this.ufoPickups = [];
        this.shieldPickups = [];
        this.ramenPickups = [];
        this.abductionBeams = [];
        this.extraLifePickups = [];
        this.explosions = [];
        this.floatingTexts = [];
        this.pickupTimer = 0;
        this.ufoPickupTimer = 0;
        this.ramenPickupTimer = 0;
        this.shieldPickupTimer = 0;
        this.abductionTimer = 0;
        this.extraLifeTimer = 0;
        this.paused = false;
        this.whaleEvent = {
            active: false,
            x: 0,
            y: 0,
            width: 88,
            height: 34,
            beamX: 0,
            beamWidth: 18,
            timer: 0,
            hitCooldown: 0
        };
        this.gravityGlitch = {
            active: false,
            timer: 0,
            swapTimer: 0,
            current: this.baseGravity
        };
        this.bonusRound = {
            active: false,
            timer: 0,
            coins: [],
            spawnTimer: 0,
            savedSpeed: 0
        };
        this.touchState = {
            startX: 0,
            startY: 0,
            tracking: false
        };

        this.init();
    }

    // --- AUDIO ---

    initAudio() {
        if (this.audioCtx) return;
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.musicGain = this.audioCtx.createGain();
            this.musicGain.gain.value = 0.045;
            this.musicGain.connect(this.audioCtx.destination);
            this.musicNextAt = this.audioCtx.currentTime;
        } catch (e) {
            console.warn('Web Audio not supported');
        }
    }

    playSound(type) {
        if (!this.audioCtx) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        const now = this.audioCtx.currentTime;

        switch (type) {
            case 'jump':
                osc.type = 'square';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;

            case 'score':
                osc.type = 'square';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.setValueAtTime(800, now + 0.05);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;

            case 'gameOver':
                osc.type = 'square';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'start':
                osc.type = 'square';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;

            case 'phase':
                osc.type = 'square';
                osc.frequency.setValueAtTime(100, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.3);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'pickup':
                osc.type = 'square';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.setValueAtTime(600, now + 0.05);
                osc.frequency.setValueAtTime(900, now + 0.1);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;

            case 'shoot':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.06);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
                osc.start(now);
                osc.stop(now + 0.06);
                break;

            case 'explosion':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;

            case 'ufoEnter':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
                break;

            case 'ufoExit':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;

            case 'shield':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(1100, now + 0.18);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
                osc.start(now);
                osc.stop(now + 0.18);
                break;

            case 'ramen':
                osc.type = 'square';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.setValueAtTime(740, now + 0.04);
                osc.frequency.setValueAtTime(980, now + 0.08);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
                osc.start(now);
                osc.stop(now + 0.14);
                break;

            case 'whale':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.35);
                osc.start(now);
                osc.stop(now + 0.35);
                break;
        }
    }

    playMusicNote(freq, duration = 0.18, type = 'square', volume = 0.04) {
        if (!this.audioCtx || !this.musicGain) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.musicNextAt);
        gain.gain.setValueAtTime(volume, this.musicNextAt);
        gain.gain.exponentialRampToValueAtTime(0.001, this.musicNextAt + duration);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(this.musicNextAt);
        osc.stop(this.musicNextAt + duration);
    }

    updateMusic() {
        if (!this.audioCtx || !this.gameStarted || this.isGameOver || this.gameMode !== 'fullscreen' || this.paused) return;
        const now = this.audioCtx.currentTime;
        const stepDuration = this.currentPhase === 3 ? 0.12 : this.currentPhase === 2 ? 0.16 : 0.2;
        const phasePatterns = {
            1: [196, 247, 294, 247, 196, 247, 330, 247],
            2: [196, 233, 294, 220, 196, 262, 330, 220],
            3: [220, 330, 392, 330, 262, 392, 494, 392]
        };
        const bassPatterns = {
            1: [98, 98, 123, 98],
            2: [98, 110, 123, 110],
            3: [110, 147, 165, 147]
        };
        while (this.musicNextAt < now + 0.12) {
            const melody = phasePatterns[this.currentPhase];
            const bass = bassPatterns[this.currentPhase];
            const melodyNote = melody[this.musicStep % melody.length];
            const bassNote = bass[this.musicBar % bass.length];
            this.playMusicNote(melodyNote, stepDuration * 0.9, this.currentPhase === 3 ? 'sawtooth' : 'square', 0.05);
            if (this.musicStep % 2 === 0) {
                this.playMusicNote(bassNote, stepDuration * 0.95, 'triangle', 0.028);
                this.musicBar++;
            }
            this.musicNextAt += stepDuration;
            this.musicStep++;
        }
    }

    // --- INIT & LIFECYCLE ---

    init() {
        this.resize();
        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);

        const observer = new MutationObserver(() => {
            this.isDarkMode = document.documentElement.getAttribute('data-md-color-scheme') === 'slate';
            this.color = this.isDarkMode ? '#ffffff' : '#535353';
            this.generateStars();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-md-color-scheme'] });

        this.reset();
        this.setupListeners();
        this.animate();
    }

    generateStars() {
        this.stars = [];
        const starCount = Math.floor(this.canvas.width / 15);
        for (let i = 0; i < starCount; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * (this.canvas.height - 15),
                size: Math.random() > 0.7 ? 2 : 1,
                twinkle: Math.random() * 100
            });
        }
    }

    generateGroundBumps() {
        this.groundBumps = [];
        let x = 0;
        while (x < this.canvas.width + 100) {
            const bumpType = Math.random();
            if (bumpType > 0.85) {
                this.groundBumps.push({ x, type: 'hill', width: 8 + Math.random() * 6 });
                x += 20 + Math.random() * 30;
            } else if (bumpType > 0.7) {
                this.groundBumps.push({ x, type: 'rock', size: 1 + Math.floor(Math.random() * 2) });
                x += 10 + Math.random() * 20;
            } else {
                x += 5 + Math.random() * 15;
            }
        }
    }

    reset() {
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('ninjaHighScore') || '0');
        this.isGameOver = false;
        this.gameStarted = false;
        this.currentSpeed = this.options.speed;
        this.frameCount = 0;

        this.currentPhase = 1;
        this.options.gravity = this.baseGravity;
        this.screenShake = 0;
        this.isGlitching = false;
        this.warpRingRadius = 0;
        this.particles = [];
        this.phaseFlashText = '';
        this.phaseFlashAlpha = 0;

        // Reset extended mode state
        this.playerState = 'running';
        this.weapon = { ammo: 0, active: false };
        this.projectiles = [];
        this.pickups = [];
        this.ufo = { active: false, timer: 0, health: 1, shieldActive: false, shieldTimer: 0 };
        this.ufoPickups = [];
        this.shieldPickups = [];
        this.ramenPickups = [];
        this.abductionBeams = [];
        this.extraLifePickups = [];
        this.explosions = [];
        this.floatingTexts = [];
        this.pickupTimer = 0;
        this.ufoPickupTimer = 0;
        this.ramenPickupTimer = 0;
        this.shieldPickupTimer = 0;
        this.abductionTimer = 0;
        this.extraLifeTimer = 0;
        this.paused = false;
        this.whaleEvent = {
            active: false,
            x: 0,
            y: 0,
            width: 88,
            height: 34,
            beamX: 0,
            beamWidth: 18,
            timer: 0,
            hitCooldown: 0
        };
        this.gravityGlitch = {
            active: false,
            timer: 0,
            swapTimer: 0,
            current: this.baseGravity
        };
        this.bonusRound = {
            active: false,
            timer: 0,
            coins: [],
            spawnTimer: 0,
            savedSpeed: 0
        };
        if (this.musicGain) this.musicGain.gain.value = 0.045;
        this.lives = 3;
        this.maxLives = 5;
        this.invulnerableTimer = 0;

        this.ninja = {
            x: 5,
            y: 0,
            width: 20,
            height: 22,
            dy: 0,
            ducking: false,
            movingLeft: false,
            movingRight: false,
            movingUp: false,
            movingDown: false,
            runFrame: 0,
            idleFrame: 0
        };

        this.obstacles = [];
        this.nextObstacleTimer = 0;
        this.groundOffset = 0;

        this.groundY = this.canvas.height - 8;
        this.ninja.y = this.groundY - this.ninja.height;

        this.generateStars();
        this.generateGroundBumps();
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        this.canvas.width = rect.width || 200;
        this.canvas.height = rect.height || 40;
        this.groundY = this.canvas.height - 8;
        if (this.ninja) {
            this.ninja.y = this.groundY - this.ninja.height;
        }
        this.generateStars();
        this.generateGroundBumps();
    }

    // --- INPUT ---

    setupListeners() {
        const handleKeyDown = (e) => {
            if (['ArrowUp', 'Space', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }

            if (e.code === 'ArrowUp' || e.code === 'Space') {
                if (this.isGameOver) {
                    this.reset();
                } else if (!this.gameStarted) {
                    this.initAudio();
                    this.gameStarted = true;
                    this.playSound('start');
                } else {
                    this.jump();
                }
            }
            if (e.code === 'ArrowDown' && this.gameStarted && !this.isGameOver && this.playerState !== 'ufo') {
                this.ninja.ducking = true;
                this.ninja.height = 12;
                this.ninja.y = this.groundY - this.ninja.height;
            }
            if (e.code === 'ArrowLeft' && this.gameStarted && !this.isGameOver) {
                this.ninja.movingLeft = true;
            }
            if (e.code === 'ArrowRight' && this.gameStarted && !this.isGameOver) {
                this.ninja.movingRight = true;
            }
            if (e.code === 'Escape' && this.isFullscreen) {
                this.exitFullscreen();
            }
            // Fullscreen-only: Shoot
            if ((e.code === 'KeyZ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && this.gameMode === 'fullscreen' && this.gameStarted && !this.isGameOver) {
                this.shoot();
            }
            // Fullscreen-only: Pause
            if (e.code === 'KeyP' && this.gameMode === 'fullscreen' && this.gameStarted && !this.isGameOver) {
                this.paused = !this.paused;
            }
            // UFO mode: Up/Down controls altitude
            if (this.playerState === 'ufo' && this.gameStarted && !this.isGameOver) {
                if (e.code === 'ArrowUp' || e.code === 'Space') {
                    this.ninja.movingUp = true;
                }
                if (e.code === 'ArrowDown') {
                    this.ninja.movingDown = true;
                }
            }
        };

        const handleKeyUp = (e) => {
            if (e.code === 'ArrowDown') {
                if (this.playerState !== 'ufo') {
                    this.ninja.ducking = false;
                    this.ninja.height = 22;
                    if (this.ninja.y >= this.groundY - 25) {
                        this.ninja.y = this.groundY - this.ninja.height;
                    }
                }
            }
            if (e.code === 'ArrowLeft') this.ninja.movingLeft = false;
            if (e.code === 'ArrowRight') this.ninja.movingRight = false;
            if (e.code === 'ArrowUp' || e.code === 'Space') this.ninja.movingUp = false;
            if (e.code === 'ArrowDown') this.ninja.movingDown = false;
        };

        const handleClick = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clickX = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0) - rect.left;
            const clickY = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0) - rect.top;

            // Check fullscreen icon click (top-right corner, 24×24 area)
            const iconSize = 20;
            const iconPad = 6;
            if (!this.options.standalone && clickX >= this.canvas.width - iconSize - iconPad && clickY <= iconSize + iconPad) {
                e.stopPropagation();
                if (this.isFullscreen) {
                    this.exitFullscreen();
                } else {
                    this.enterFullscreen();
                }
                return;
            }

            if (this.isGameOver) {
                this.reset();
            } else if (!this.gameStarted) {
                this.initAudio();
                this.gameStarted = true;
                this.playSound('start');
            } else {
                this.jump();
            }
        };

        const handleTouchStart = (e) => {
            if (this.gameMode === 'fullscreen' && 'ontouchstart' in window) {
                // In mobile fullscreen, only allow tap-to-start or game-over reset
                if (!this.gameStarted || this.isGameOver) {
                    handleClick(e);
                }
                return;
            }

            const touch = e.touches && e.touches[0];
            if (!touch) return;
            this.touchState.startX = touch.clientX;
            this.touchState.startY = touch.clientY;
            this.touchState.tracking = true;
            if (!this.gameStarted || this.isGameOver) {
                handleClick(e);
            } else {
                const rect = this.canvas.getBoundingClientRect();
                const clickX = touch.clientX - rect.left;
                const clickY = touch.clientY - rect.top;
                const iconSize = 20;
                const iconPad = 6;
                if (!this.options.standalone && clickX >= this.canvas.width - iconSize - iconPad && clickY <= iconSize + iconPad) {
                    handleClick(e);
                }
            }
            e.preventDefault();
        };

        const handleTouchEnd = (e) => {
            if (this.gameMode === 'fullscreen' && 'ontouchstart' in window) return;

            if (!this.touchState.tracking) return;
            const touch = (e.changedTouches && e.changedTouches[0]) || null;
            if (!touch) return;

            const dx = touch.clientX - this.touchState.startX;
            const dy = touch.clientY - this.touchState.startY;
            const absX = Math.abs(dx);
            const absY = Math.abs(dy);
            this.touchState.tracking = false;

            if (absX < 20 && absY < 20) {
                if (this.gameMode === 'fullscreen' && touch.clientX > window.innerWidth * 0.55 && (this.playerState === 'armed' || this.playerState === 'ufo')) {
                    this.shoot();
                } else if (this.gameStarted && !this.isGameOver && this.playerState !== 'ufo') {
                    this.jump();
                }
                e.preventDefault();
                return;
            }

            if (absY > absX) {
                if (dy < -20) {
                    if (this.playerState === 'ufo') {
                        this.ninja.movingUp = true;
                        setTimeout(() => { this.ninja.movingUp = false; }, 160);
                    } else {
                        this.jump();
                    }
                } else if (dy > 20) {
                    if (this.playerState === 'ufo') {
                        this.ninja.movingDown = true;
                        setTimeout(() => { this.ninja.movingDown = false; }, 160);
                    } else if (!this.isGameOver && this.gameStarted) {
                        this.ninja.ducking = true;
                        this.ninja.height = 12;
                        this.ninja.y = this.groundY - this.ninja.height;
                        setTimeout(() => {
                            if (this.playerState !== 'ufo') {
                                this.ninja.ducking = false;
                                this.ninja.height = 22;
                                this.ninja.y = Math.min(this.ninja.y, this.groundY - this.ninja.height);
                            }
                        }, 180);
                    }
                }
            } else if (this.gameMode === 'fullscreen') {
                if (dx > 20 && (this.playerState === 'armed' || this.playerState === 'ufo')) {
                    this.shoot();
                } else if (dx < -20) {
                    this.ninja.movingLeft = true;
                    setTimeout(() => { this.ninja.movingLeft = false; }, 180);
                }
            }

            e.preventDefault();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        this.canvas.addEventListener('click', handleClick);
        this.canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    jump() {
        if (this.playerState === 'ufo') return;
        if (this.ninja.y >= this.groundY - this.ninja.height - 5 || this.onSatellite) {
            this.spawnDustParticles();
            this.ninja.dy = this.options.jumpStrength;
            this.playSound('jump');
            this.onSatellite = false;
        }
    }

    // --- WEAPON & SHOOTING (fullscreen only) ---

    shoot() {
        if (this.gameMode !== 'fullscreen') return;
        if (this.playerState === 'ufo') {
            if (this.ufo.superWeapon) {
                // Triple spread shot!
                [-2, 0, 2].forEach(spread => {
                    this.projectiles.push({
                        x: this.ninja.x + 30,
                        y: this.ninja.y + 10,
                        dx: 12,
                        dy: spread,
                        life: 80,
                        fromUfo: true
                    });
                });
                this.ufo.superWeapon--;
                if (this.ufo.superWeapon <= 0) {
                    this.spawnFloatingText('POWER OFF', this.ninja.x, this.ninja.y - 14, '#f66');
                }
            } else {
                this.projectiles.push({
                    x: this.ninja.x + 30,
                    y: this.ninja.y + 10,
                    dx: 10,
                    dy: 0,
                    life: 60,
                    fromUfo: true
                });
            }
            this.playSound('shoot');
            return;
        }
        if (this.playerState !== 'armed' || this.weapon.ammo <= 0) return;
        this.weapon.ammo--;
        if (this.weapon.ammo <= 0) {
            this.weapon.active = false;
            this.playerState = 'running';
        }
        this.projectiles.push({
            x: this.ninja.x + this.ninja.width,
            y: this.ninja.y + 6,
            dx: 8,
            dy: 0,
            life: 80,
            fromUfo: false
        });
        this.playSound('shoot');
    }

    spawnPickup() {
        if (this.gameMode !== 'fullscreen') return;
        // Ninja max jump is ~100px. Spawn within reachable height.
        const spawnY = this.groundY - 30 - Math.random() * 60;
        this.pickups.push({
            x: this.canvas.width + 10,
            y: spawnY,
            width: 10,

            height: 10,
            glow: 0
        });
    }

    spawnUfoPickup() {
        if (this.gameMode !== 'fullscreen') return;
        this.ufoPickups.push({
            x: this.canvas.width + 10,
            y: this.groundY - 28 - Math.random() * 10,
            width: 28,
            height: 18,
            glow: 0
        });
    }

    spawnShieldPickup() {
        if (this.gameMode !== 'fullscreen' || this.playerState !== 'ufo') return;
        this.shieldPickups.push({
            x: this.canvas.width + 20,
            y: 24 + Math.random() * Math.max(20, this.groundY - 90),
            width: 12,
            height: 12,
            glow: 0
        });
    }

    spawnRamenPickup() {
        if (this.gameMode !== 'fullscreen') return;
        this.ramenPickups.push({
            x: this.canvas.width + 20,
            y: this.groundY - 26 - Math.random() * 70,
            width: 12,
            height: 12,
            glow: 0
        });
    }

    spawnExtraLifePickup() {
        if (this.gameMode !== 'fullscreen' || this.lives >= this.maxLives) return;
        this.extraLifePickups.push({
            x: this.canvas.width + 20,
            y: this.groundY - 28 - Math.random() * 70,
            width: 12,
            height: 12,
            glow: 0
        });
    }

    updatePickups() {
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const p = this.pickups[i];
            p.x -= this.currentSpeed;
            p.glow = (p.glow + 0.1) % (Math.PI * 2);
            if (this.ninja.x < p.x + p.width &&
                this.ninja.x + this.ninja.width > p.x &&
                this.ninja.y < p.y + p.height &&
                this.ninja.y + this.ninja.height > p.y) {
                this.pickups.splice(i, 1);
                this.playSound('pickup');
                if (this.playerState === 'ufo') {
                    // UFO gets a super weapon power-up!
                    this.ufo.superWeapon = 8;
                    this.spawnFloatingText('SUPER WEAPON!', p.x, p.y - 8, '#0ff');
                } else {
                    this.weapon = { ammo: 5, active: true };
                    this.playerState = 'armed';
                    this.spawnFloatingText('+WEAPON', p.x, p.y, '#fff');
                }
                continue;
            }
            if (p.x < -20) this.pickups.splice(i, 1);
        }
    }

    updateShieldPickups() {
        for (let i = this.shieldPickups.length - 1; i >= 0; i--) {
            const p = this.shieldPickups[i];
            p.x -= this.currentSpeed * 1.1;
            p.glow = (p.glow + 0.14) % (Math.PI * 2);

            if (this.ninja.x < p.x + p.width &&
                this.ninja.x + this.ninja.width > p.x &&
                this.ninja.y < p.y + p.height &&
                this.ninja.y + this.ninja.height > p.y) {
                this.shieldPickups.splice(i, 1);
                this.ufo.shieldActive = true;
                this.ufo.shieldTimer = 480;
                this.playSound('shield');
                this.spawnFloatingText('SHIELD CORE!', p.x, p.y - 8, '#0ff');
                this.triggerShake();
                continue;
            }

            if (p.x < -20) this.shieldPickups.splice(i, 1);
        }
    }

    updateRamenPickups() {
        for (let i = this.ramenPickups.length - 1; i >= 0; i--) {
            const p = this.ramenPickups[i];
            p.x -= this.currentSpeed;
            p.glow = (p.glow + 0.12) % (Math.PI * 2);

            if (this.ninja.x < p.x + p.width &&
                this.ninja.x + this.ninja.width > p.x &&
                this.ninja.y < p.y + p.height &&
                this.ninja.y + this.ninja.height > p.y) {
                this.ramenPickups.splice(i, 1);
                this.score += 7;
                this.playSound('ramen');
                this.spawnFloatingText('RAMEN +7', p.x, p.y - 8, '#ff0');
                if (this.playerState === 'ufo') {
                    this.ufo.timer = Math.min(780, this.ufo.timer + 75);
                    this.spawnFloatingText('DELIVERY BOOST', p.x, p.y + 10, '#0ff');
                }
                continue;
            }

            if (p.x < -20) this.ramenPickups.splice(i, 1);
        }
    }

    updateExtraLifePickups() {
        for (let i = this.extraLifePickups.length - 1; i >= 0; i--) {
            const p = this.extraLifePickups[i];
            p.x -= this.currentSpeed;
            p.glow = (p.glow + 0.1) % (Math.PI * 2);

            if (this.ninja.x < p.x + p.width &&
                this.ninja.x + this.ninja.width > p.x &&
                this.ninja.y < p.y + p.height &&
                this.ninja.y + this.ninja.height > p.y) {
                this.extraLifePickups.splice(i, 1);
                this.lives = Math.min(this.maxLives, this.lives + 1);
                this.playSound('pickup');
                this.spawnFloatingText('+1 LIFE', p.x, p.y - 8, '#0f6');
                continue;
            }

            if (p.x < -20) this.extraLifePickups.splice(i, 1);
        }
    }

    takeLifeHit(obs) {
        if (this.invulnerableTimer > 0) return;
        this.lives--;
        this.invulnerableTimer = 90;
        this.triggerShake();
        this.spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2);
        this.playSound('explosion');
        if (this.lives > 0) {
            this.spawnFloatingText(`-${1} LIFE`, this.ninja.x + 16, this.ninja.y - 12, '#f66');
            this.ninja.dy = this.options.jumpStrength * 0.6;
        } else {
            this.isGameOver = true;
            this.playSound('gameOver');
            if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('ninjaHighScore', this.highScore.toString());
            }
        }
    }

    updateUfoPickups() {
        for (let i = this.ufoPickups.length - 1; i >= 0; i--) {
            const u = this.ufoPickups[i];
            u.x -= this.currentSpeed * 0.7;
            u.glow = (u.glow + 0.08) % (Math.PI * 2);
            if (this.playerState !== 'ufo' &&
                this.ninja.x < u.x + u.width &&
                this.ninja.x + this.ninja.width > u.x &&
                this.ninja.y < u.y + u.height &&
                this.ninja.y + this.ninja.height > u.y) {
                this.ufoPickups.splice(i, 1);
                this.enterUfo();
                continue;
            }
            if (u.x < -40) this.ufoPickups.splice(i, 1);
        }
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            proj.x += proj.dx;
            proj.y += proj.dy || 0;
            proj.life--;
            if (proj.life <= 0 || proj.x > this.canvas.width + 10) {
                this.projectiles.splice(i, 1);
                continue;
            }
            for (let j = this.obstacles.length - 1; j >= 0; j--) {
                const obs = this.obstacles[j];
                if (proj.x < obs.x + obs.width &&
                    proj.x + 6 > obs.x &&
                    proj.y < obs.y + obs.height &&
                    proj.y + 4 > obs.y) {
                    const pts = obs.type === 'satellite' ? 5 : 3;
                    this.score += pts;
                    this.spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2);
                    this.spawnFloatingText(`+${pts}`, obs.x, obs.y, '#0f6');
                    this.playSound('explosion');
                    this.triggerShake();
                    this.obstacles.splice(j, 1);
                    this.projectiles.splice(i, 1);
                    break;
                }
            }
            if (!this.projectiles[i]) continue;
            if (!proj.fromUfo && (proj.bounces || 0) < 1 && proj.y >= this.groundY - 6) {
                proj.dy = -2.8 - Math.random() * 0.8;
                proj.dx = Math.max(5.5, proj.dx * 0.92);
                proj.y = this.groundY - 8;
                proj.bounces = (proj.bounces || 0) + 1;
                this.spawnFloatingText('RICOCHET!', proj.x + 12, proj.y - 6, '#ff0');
                this.playSound('shoot');
            } else if (proj.y < 6 || proj.y > this.canvas.height + 6) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    enterUfo() {
        this.playerState = 'ufo';
        this.ufo = { active: true, timer: 600, health: 1, superWeapon: 0, shieldActive: false, shieldTimer: 0 };
        this.weapon = { ammo: 0, active: false };
        this.ninja.dy = 0;
        this.ninja.ducking = false;
        this.ninja.height = 22;
        this.triggerShake();
        this.playSound('ufoEnter');
        this.spawnFloatingText('UFO HIJACKED!', this.ninja.x, this.ninja.y - 20, '#0ff');
    }

    exitUfo() {
        this.playerState = 'running';
        this.ufo = { active: false, timer: 0, health: 1, shieldActive: false, shieldTimer: 0 };
        this.spawnExplosion(this.ninja.x + 14, this.ninja.y + 8);
        this.ninja.y = this.groundY - this.ninja.height;
        this.ninja.dy = 0;
        this.triggerShake();
        this.playSound('ufoExit');
        this.spawnFloatingText('EJECTED!', this.ninja.x, this.ninja.y - 10, '#f80');
    }

    updateUfo() {
        if (this.playerState !== 'ufo') return;
        this.ufo.timer--;
        if (this.ufo.shieldActive) {
            this.ufo.shieldTimer--;
            if (this.ufo.shieldTimer <= 0) {
                this.ufo.shieldActive = false;
                this.spawnFloatingText('SHIELD DOWN', this.ninja.x + 16, this.ninja.y - 10, '#8ff');
            }
        }
        
        // Smooth physics
        const accel = 0.5;
        const maxSpeed = 4;
        const friction = 0.85;

        if (this.ninja.movingUp) {
            this.ninja.dy -= accel;
        } else if (this.ninja.movingDown) {
            this.ninja.dy += accel;
        } else {
            this.ninja.dy *= friction;
        }

        if (this.ninja.dy > maxSpeed) this.ninja.dy = maxSpeed;
        if (this.ninja.dy < -maxSpeed) this.ninja.dy = -maxSpeed;

        this.ninja.y += this.ninja.dy;

        if (this.ninja.y < 10) {
            this.ninja.y = 10;
            if (this.ninja.dy < 0) this.ninja.dy = 0;
        }
        if (this.ninja.y > this.groundY - 30) {
            this.ninja.y = this.groundY - 30;
            if (this.ninja.dy > 0) this.ninja.dy = 0;
        }

        if (this.ufo.timer <= 0) {
            this.exitUfo();
        }
    }

    startWhaleEvent() {
        if (this.whaleEvent.active || this.gameMode !== 'fullscreen') return;
        this.whaleEvent = {
            active: true,
            x: this.canvas.width + 120,
            y: 24 + Math.random() * Math.max(30, this.groundY - 110),
            width: 88,
            height: 34,
            beamX: 0,
            beamWidth: 18,
            timer: 360,
            hitCooldown: 0
        };
        this.playSound('whale');
        this.spawnFloatingText('SPACE WHALE', this.canvas.width * 0.55, 34, '#8ff');
    }

    updateWhaleEvent() {
        if (!this.whaleEvent.active) return;
        const whale = this.whaleEvent;
        whale.x -= this.currentSpeed * 0.55;
        whale.timer--;
        whale.beamX = whale.x + 28 + Math.sin(this.frameCount * 0.08) * 6;
        if (whale.hitCooldown > 0) whale.hitCooldown--;

        const beamTop = whale.y + whale.height - 4;
        const beamBottom = this.canvas.height;
        const beamLeft = whale.beamX;
        const beamRight = whale.beamX + whale.beamWidth;
        const touchingBeam =
            this.ninja.x < beamRight &&
            this.ninja.x + this.ninja.width > beamLeft &&
            this.ninja.y < beamBottom &&
            this.ninja.y + this.ninja.height > beamTop;

        if (touchingBeam && whale.hitCooldown <= 0) {
            whale.hitCooldown = 35;
            if (this.playerState === 'ufo') {
                this.ufo.timer = Math.min(780, this.ufo.timer + 90);
                this.spawnFloatingText('WHALE BOOST', this.ninja.x + 18, this.ninja.y - 12, '#8ff');
            } else {
                this.ninja.dy = Math.min(this.ninja.dy, this.options.jumpStrength * 1.35);
                this.score += 3;
                this.spawnFloatingText('+3 WHEEE!', this.ninja.x + 16, this.ninja.y - 12, '#8ff');
                this.playSound('whale');
            }
        }

        if (whale.timer <= 0 || whale.x + whale.width < -40) {
            this.whaleEvent.active = false;
        }
    }

    startGravityGlitch() {
        if (this.gravityGlitch.active || this.currentPhase !== 2 || this.gameMode !== 'fullscreen') return;
        this.gravityGlitch.active = true;
        this.gravityGlitch.timer = 240;
        this.gravityGlitch.swapTimer = 0;
        this.spawnFloatingText('GRAVITY GLITCH', this.canvas.width * 0.5, 42, '#f8f');
        this.triggerGlitch();
        this.playSound('phase');
    }

    updateGravityGlitch() {
        if (!this.gravityGlitch.active) {
            if (this.currentPhase !== 3) this.options.gravity = this.baseGravity;
            return;
        }
        this.gravityGlitch.timer--;
        this.gravityGlitch.swapTimer--;
        if (this.gravityGlitch.swapTimer <= 0) {
            const gravities = [this.baseGravity * 0.32, this.baseGravity * 0.55, this.baseGravity * 1.1, this.baseGravity * 1.45];
            this.gravityGlitch.current = gravities[Math.floor(Math.random() * gravities.length)];
            this.options.gravity = this.gravityGlitch.current;
            this.gravityGlitch.swapTimer = 18 + Math.floor(Math.random() * 20);
            this.triggerGlitch();
        }
        if (this.gravityGlitch.timer <= 0) {
            this.gravityGlitch.active = false;
            this.options.gravity = this.currentPhase === 3 ? this.baseGravity * 0.5 : this.baseGravity;
            this.spawnFloatingText('GRAVITY STABLE', this.canvas.width * 0.5, 42, '#fff');
        }
    }

    spawnAbductionBeam() {
        if (this.gameMode !== 'fullscreen' || this.bonusRound.active) return;
        this.abductionBeams.push({
            x: this.canvas.width + 50,
            y: this.groundY - 80,
            width: 22,
            height: 80,
            glow: 0
        });
    }

    updateAbductionBeams() {
        for (let i = this.abductionBeams.length - 1; i >= 0; i--) {
            const beam = this.abductionBeams[i];
            beam.x -= this.currentSpeed * 0.9;
            beam.glow = (beam.glow + 0.1) % (Math.PI * 2);

            if (this.ninja.x < beam.x + beam.width &&
                this.ninja.x + this.ninja.width > beam.x &&
                this.ninja.y < beam.y + beam.height &&
                this.ninja.y + this.ninja.height > beam.y) {
                this.abductionBeams.splice(i, 1);
                this.enterBonusRound();
                continue;
            }

            if (beam.x + beam.width < -30) {
                this.abductionBeams.splice(i, 1);
            }
        }
    }

    enterBonusRound() {
        this.bonusRound.active = true;
        this.bonusRound.timer = 600;
        this.bonusRound.coins = [];
        this.bonusRound.spawnTimer = 0;
        this.bonusRound.savedSpeed = this.currentSpeed;
        this.obstacles = [];
        this.pickups = [];
        this.ufoPickups = [];
        this.shieldPickups = [];
        this.ramenPickups = [];
        this.projectiles = [];
        this.playerState = 'running';
        this.weapon = { ammo: 0, active: false };
        this.ninja.y = this.groundY - this.ninja.height;
        this.ninja.dy = -3;
        this.spawnFloatingText('ALIEN BONUS DIMENSION', this.canvas.width * 0.5, 36, '#f8f');
        this.playSound('ufoEnter');
    }

    updateBonusRound() {
        if (!this.bonusRound.active) return;
        this.bonusRound.timer--;
        this.bonusRound.spawnTimer--;
        this.currentSpeed = Math.max(this.bonusRound.savedSpeed, 5.4);

        if (this.bonusRound.spawnTimer <= 0) {
            this.bonusRound.coins.push({
                x: this.canvas.width + 20,
                y: 30 + Math.random() * Math.max(30, this.groundY - 110),
                width: 10,
                height: 10,
                glow: Math.random() * Math.PI * 2
            });
            this.bonusRound.spawnTimer = 16 + Math.random() * 22;
        }

        for (let i = this.bonusRound.coins.length - 1; i >= 0; i--) {
            const coin = this.bonusRound.coins[i];
            coin.x -= this.currentSpeed * 1.1;
            coin.glow = (coin.glow + 0.18) % (Math.PI * 2);
            if (this.ninja.x < coin.x + coin.width &&
                this.ninja.x + this.ninja.width > coin.x &&
                this.ninja.y < coin.y + coin.height &&
                this.ninja.y + this.ninja.height > coin.y) {
                this.bonusRound.coins.splice(i, 1);
                this.score += 2;
                this.playSound('score');
                this.spawnFloatingText('+2', coin.x, coin.y - 6, '#f8f');
                continue;
            }
            if (coin.x < -20) this.bonusRound.coins.splice(i, 1);
        }

        if (this.bonusRound.timer <= 0) {
            this.bonusRound.active = false;
            this.bonusRound.coins = [];
            this.spawnFloatingText('BACK TO REALITY', this.canvas.width * 0.5, 36, '#fff');
            this.currentSpeed = Math.max(this.currentSpeed, this.bonusRound.savedSpeed);
            this.triggerShake();
            this.playSound('ufoExit');
        }
    }

    spawnExplosion(cx, cy) {
        for (let i = 0; i < 10; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            this.explosions.push({
                x: cx,
                y: cy,
                dx: Math.cos(angle) * speed,
                dy: Math.sin(angle) * speed,
                life: 20 + Math.random() * 15,
                size: 1 + Math.random() * 2,
                color: Math.random() > 0.5 ? '#ff0' : '#f80'
            });
        }
    }

    updateExplosions() {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const e = this.explosions[i];
            e.x += e.dx;
            e.y += e.dy;
            e.dy += 0.05;
            e.life--;
            if (e.life <= 0) this.explosions.splice(i, 1);
        }
    }

    spawnFloatingText(text, x, y, color) {
        this.floatingTexts.push({ text, x, y, color, life: 40 });
    }

    updateFloatingTexts() {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y -= 0.8;
            ft.life--;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }

    checkCloseCall(obs) {
        if (this.gameMode !== 'fullscreen') return;
        const gap = Math.abs((this.ninja.y + this.ninja.height) - obs.y);
        if (gap < 5 && gap > 0 && this.ninja.dy <= 0) {
            this.score += 2;
            this.spawnFloatingText('+2 CLOSE!', this.ninja.x, this.ninja.y - 10, '#fff');
        }
    }

    // --- VFX ---

    triggerShake() {
        this.screenShake = 10;
    }

    triggerGlitch() {
        this.isGlitching = true;
        setTimeout(() => { this.isGlitching = false; }, 100);
    }

    showPhaseFlash(text) {
        this.phaseFlashText = text;
        this.phaseFlashAlpha = 1.0;
    }

    spawnDustParticles() {
        const nx = this.ninja.x + this.ninja.width / 2;
        const ny = this.groundY;
        for (let i = 0; i < 5; i++) {
            this.particles.push({
                x: nx + (Math.random() - 0.5) * 8,
                y: ny - Math.random() * 2,
                dx: (Math.random() - 0.5) * 2,
                dy: -(Math.random() * 1.5 + 0.5),
                life: 15 + Math.random() * 10,
                size: 1 + Math.random()
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.dx;
            p.y += p.dy;
            p.dy += 0.05;
            p.life--;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    drawParticles() {
        this.particles.forEach(p => {
            const alpha = Math.max(0, p.life / 25);
            this.ctx.fillStyle = this.currentPhase === 3
                ? `rgba(0, 255, 150, ${alpha})`
                : `rgba(255, 255, 255, ${alpha * 0.6})`;
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
        });
    }

    // --- FULLSCREEN DIALOG ---

    enterFullscreen() {
        if (this.isFullscreen) return;
        this.isFullscreen = true;
        this.gameMode = 'fullscreen';
        this.originalContainer = this.container;

        const isMobile = window.innerWidth <= 800 || ('ontouchstart' in window);
        const CTRL_BAR_H = 90; // px reserved for the mobile button bar

        // Create overlay
        this.dialogOverlay = document.createElement('div');
        this.dialogOverlay.id = 'ninja-fullscreen-overlay';
        this.dialogOverlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            background: ${isMobile ? '#0f172a' : 'rgba(0, 0, 0, 0.92)'};
            display: flex; flex-direction: column;
            align-items: center; justify-content: ${isMobile ? 'flex-start' : 'center'};
            backdrop-filter: blur(8px);
            animation: ninjaFadeIn 0.25s ease-out;
            touch-action: none;
            overflow: hidden;
        `;

        // Inject animation keyframes if not already present
        if (!document.getElementById('ninja-fullscreen-styles')) {
            const style = document.createElement('style');
            style.id = 'ninja-fullscreen-styles';
            style.textContent = `
                @keyframes ninjaFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        // Title (hide on mobile to save vertical space)
        if (!isMobile) {
            const title = document.createElement('div');
            title.style.cssText = `
                color: #00ff96; font-family: monospace; font-size: 18px;
                font-weight: bold; letter-spacing: 4px; margin-bottom: 16px;
                text-shadow: 0 0 10px rgba(0,255,150,0.5);
            `;
            title.textContent = 'ASTRO-NINJA: STARGATE PROTOCOL';
            this.dialogOverlay.appendChild(title);
        }

        // Game container inside dialog
        const dialogContainer = document.createElement('div');
        dialogContainer.id = 'ninja-fullscreen-container';

        if (isMobile) {
            // Mobile: fill width, take all height except the control bar area
            dialogContainer.style.cssText = `
                width: 100vw;
                height: 100dvh;
                border: none;
                box-shadow: none;
                border-radius: 0;
                position: relative;
                background: #0f172a;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                flex-shrink: 0;
            `;
        } else {
            // Desktop: centered floating window
            dialogContainer.style.cssText = `
                width: min(960px, 95vw);
                height: min(400px, 70vh);
                border: 2px solid #334155;
                box-shadow: 0 0 30px rgba(0, 255, 150, 0.15), 0 0 60px rgba(0, 255, 150, 0.05);
                border-radius: 4px;
                position: relative;
                background: #0f172a;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            `;
        }
        this.dialogOverlay.appendChild(dialogContainer);

        // Controls hint (desktop only)
        if (!isMobile) {
            const hint = document.createElement('div');
            hint.style.cssText = `
                color: #94a3b8; font-family: monospace; font-size: 12px;
                margin-top: 14px; text-align: center;
            `;
            hint.innerHTML = 'Space / Up = Jump &nbsp;|&nbsp; Down = Duck &nbsp;|&nbsp; Left / Right = Move &nbsp;|&nbsp; Z = Shoot &nbsp;|&nbsp; P = Pause &nbsp;|&nbsp; <span style="color:#00ff96">ESC</span> = Close';
            this.dialogOverlay.appendChild(hint);
        }

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            position: absolute;
            top: ${isMobile ? 'max(8px, env(safe-area-inset-top, 8px))' : '16px'};
            right: ${isMobile ? 'max(8px, env(safe-area-inset-right))' : '20px'};
            background: rgba(0,0,0,0.6); border: 1px solid #475569;
            color: #94a3b8; font-size: ${isMobile ? '18px' : '22px'}; cursor: pointer;
            width: ${isMobile ? '32px' : '36px'}; height: ${isMobile ? '32px' : '36px'};
            display: flex; align-items: center; justify-content: center; z-index: 100;
            border-radius: 4px; transition: all 0.2s;
            font-family: monospace; backdrop-filter: blur(4px);
        `;
        if (!isMobile) {
            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.borderColor = '#00ff96';
                closeBtn.style.color = '#00ff96';
            });
            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.borderColor = '#475569';
                closeBtn.style.color = '#94a3b8';
            });
        }
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.exitFullscreen(); });
        closeBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.exitFullscreen(); }, { passive: false });

        if (isMobile) {
            dialogContainer.appendChild(closeBtn);
        } else {
            this.dialogOverlay.appendChild(closeBtn);
        }

        // ——— MOBILE TOUCH CONTROLS: Gesture-based ———
        if (isMobile) {
            // Touch gesture state
            const touchState = { startX: 0, startY: 0, startTime: 0, tracking: false, moved: false };

            // Main touch area — covers the game canvas
            const touchLayer = document.createElement('div');
            touchLayer.id = 'ninja-touch-layer';
            touchLayer.style.cssText = `
                position: absolute; inset: 0; z-index: 15;
            `;

            touchLayer.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const t = e.touches[0];
                if (!t) return;
                touchState.startX = t.clientX;
                touchState.startY = t.clientY;
                touchState.startTime = Date.now();
                touchState.tracking = true;
                touchState.moved = false;

                // Handle game start / restart
                if (!this.gameStarted && !this.isGameOver) {
                    this.initAudio();
                    this.gameStarted = true;
                    this.playSound('start');
                    return;
                }
                if (this.isGameOver) {
                    this.reset();
                    return;
                }
            }, { passive: false });

            touchLayer.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (!touchState.tracking || !this.gameStarted || this.isGameOver) return;
                const t = e.touches[0];
                if (!t) return;

                const dx = t.clientX - touchState.startX;
                const dy = t.clientY - touchState.startY;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                // Track if touch has moved significantly
                if (absDx > 12 || absDy > 12) touchState.moved = true;

                // Horizontal drag → move ninja left/right
                if (absDx > 15) {
                    if (dx < -15) {
                        this.ninja.movingLeft = true;
                        this.ninja.movingRight = false;
                    } else if (dx > 15) {
                        this.ninja.movingRight = true;
                        this.ninja.movingLeft = false;
                    }
                }

                // Vertical swipe down → duck
                if (dy > 25 && absDy > absDx) {
                    if (this.playerState === 'ufo') {
                        this.ninja.movingDown = true;
                    } else if (!this.ninja.ducking) {
                        this.ninja.ducking = true;
                        this.ninja.height = 12;
                        this.ninja.y = this.groundY - this.ninja.height;
                    }
                }

                // Vertical swipe up → UFO up or jump while dragging
                if (dy < -25 && absDy > absDx) {
                    if (this.playerState === 'ufo') {
                        this.ninja.movingUp = true;
                    }
                }
            }, { passive: false });

            touchLayer.addEventListener('touchend', (e) => {
                e.preventDefault();
                if (!touchState.tracking) return;
                touchState.tracking = false;

                // Stop all movement
                this.ninja.movingLeft = false;
                this.ninja.movingRight = false;
                if (this.playerState === 'ufo') {
                    this.ninja.movingUp = false;
                    this.ninja.movingDown = false;
                }

                // Un-duck
                if (this.ninja.ducking && this.playerState !== 'ufo') {
                    this.ninja.ducking = false;
                    this.ninja.height = 22;
                    this.ninja.y = Math.min(this.ninja.y, this.groundY - this.ninja.height);
                }

                // Quick tap (no drag) = jump
                const elapsed = Date.now() - touchState.startTime;
                if (!touchState.moved && elapsed < 300 && this.gameStarted && !this.isGameOver) {
                    if (this.playerState === 'ufo') {
                        this.ninja.movingUp = true;
                        setTimeout(() => { this.ninja.movingUp = false; }, 160);
                    } else {
                        this.jump();
                    }
                }
            }, { passive: false });

            touchLayer.addEventListener('touchcancel', () => {
                touchState.tracking = false;
                this.ninja.movingLeft = false;
                this.ninja.movingRight = false;
                if (this.playerState === 'ufo') {
                    this.ninja.movingUp = false;
                    this.ninja.movingDown = false;
                }
                if (this.ninja.ducking && this.playerState !== 'ufo') {
                    this.ninja.ducking = false;
                    this.ninja.height = 22;
                    this.ninja.y = Math.min(this.ninja.y, this.groundY - this.ninja.height);
                }
            });

            dialogContainer.appendChild(touchLayer);

            // Single floating Shoot button (bottom-right)
            const shootBtn = document.createElement('div');
            shootBtn.innerHTML = '🎯';
            shootBtn.id = 'ninja-shoot-btn';
            shootBtn.style.cssText = `
                position: absolute; z-index: 25;
                bottom: max(16px, env(safe-area-inset-bottom, 16px));
                right: max(16px, env(safe-area-inset-right, 16px));
                width: 56px; height: 56px; border-radius: 50%;
                background: rgba(136, 0, 255, 0.25); border: 2px solid rgba(136, 0, 255, 0.5);
                color: white; font-size: 22px;
                display: flex; align-items: center; justify-content: center;
                user-select: none; -webkit-touch-callout: none; -webkit-user-select: none;
                touch-action: none;
                transition: background 0.08s, border-color 0.08s;
                backdrop-filter: blur(4px);
            `;

            shootBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                shootBtn.style.background = 'rgba(136, 0, 255, 0.5)';
                shootBtn.style.borderColor = 'rgba(136, 0, 255, 0.8)';
                if ((this.playerState === 'armed' || this.playerState === 'ufo') && this.gameStarted && !this.isGameOver) {
                    this.shoot();
                }
            }, { passive: false });
            shootBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                e.stopPropagation();
                shootBtn.style.background = 'rgba(136, 0, 255, 0.25)';
                shootBtn.style.borderColor = 'rgba(136, 0, 255, 0.5)';
            }, { passive: false });

            dialogContainer.appendChild(shootBtn);

            // Control hint text (shows briefly then fades)
            const mobileHint = document.createElement('div');
            mobileHint.style.cssText = `
                position: absolute; bottom: 80px; left: 0; right: 0;
                text-align: center; z-index: 20;
                color: rgba(148, 163, 184, 0.8); font-family: monospace; font-size: 11px;
                pointer-events: none;
                transition: opacity 1s ease-out;
            `;
            mobileHint.textContent = 'TAP = Jump  •  SWIPE DOWN = Duck  •  DRAG = Move  •  🎯 = Shoot';
            dialogContainer.appendChild(mobileHint);
            setTimeout(() => { mobileHint.style.opacity = '0'; }, 4000);
        }

        document.body.appendChild(this.dialogOverlay);

        // Move canvas to dialog container
        this.container = dialogContainer;
        dialogContainer.appendChild(this.canvas);

        // Slight delay to ensure layout is ready before resize calculation occurs
        setTimeout(() => this.resize(), 50);
    }

    exitFullscreen() {
        if (!this.isFullscreen || !this.dialogOverlay) return;
        this.isFullscreen = false;
        this.gameMode = 'header';

        // Clean up mobile game-over interval
        if (this._mobileGameOverCheck) {
            clearInterval(this._mobileGameOverCheck);
            this._mobileGameOverCheck = null;
        }

        // Move canvas back to original container
        this.container = this.originalContainer;
        this.originalContainer.appendChild(this.canvas);
        this.resize();

        // Remove overlay
        this.dialogOverlay.remove();
        this.dialogOverlay = null;
        this.originalContainer = null;
    }

    // --- OBSTACLES ---

    spawnObstacle() {
        const types = ['rocketSmall', 'rocketLarge', 'satellite'];
        const type = types[Math.floor(Math.random() * types.length)];

        let obs = { x: this.canvas.width + 20, type };

        if (type === 'rocketSmall') {
            obs.width = 12;
            obs.height = 20;
            obs.y = this.groundY - obs.height;
        } else if (type === 'rocketLarge') {
            obs.width = 14;
            obs.height = 26;
            obs.y = this.groundY - obs.height;
        } else {
            obs.width = 22;
            obs.height = 14;
            obs.y = this.groundY - 20 - Math.random() * 5;
        }

        this.obstacles.push(obs);
    }

    // --- UPDATE ---

    update() {
        if (this.paused) return;
        this.frameCount++;
        this.updateMusic();

        // Twinkle stars
        this.stars.forEach(star => {
            star.twinkle = (star.twinkle + 1) % 100;
        });

        // Idle animation when not started
        if (!this.gameStarted) {
            if (this.frameCount % 30 === 0) {
                this.ninja.idleFrame = (this.ninja.idleFrame + 1) % 2;
            }
            return;
        }

        if (this.isGameOver) return;

        if (this.gameMode === 'fullscreen' && this.currentPhase === 2 && !this.bonusRound.active && Math.random() < 0.0018) {
            this.startGravityGlitch();
        }
        this.updateGravityGlitch();
        if (this.invulnerableTimer > 0) this.invulnerableTimer--;

        if (this.bonusRound.active) {
            this.ninja.dy += this.options.gravity * 0.7;
            this.ninja.y += this.ninja.dy;
            const maxY = this.groundY - this.ninja.height;
            if (this.ninja.y > maxY) {
                this.ninja.y = maxY;
                this.ninja.dy = 0;
            }
            if (this.frameCount % 6 === 0) {
                this.ninja.runFrame = (this.ninja.runFrame + 1) % 2;
            }
            this.groundOffset = (this.groundOffset + this.currentSpeed) % 200;
            this.stars.forEach(s => {
                s.x -= this.currentSpeed * 0.55;
                if (s.x < 0) s.x = this.canvas.width;
            });
            this.updateBonusRound();
            this.updateParticles();
            this.updateFloatingTexts();
            return;
        }

        // Phase transitions
        if (this.score > 50 && this.currentPhase === 1) {
            this.currentPhase = 2;
            this.triggerShake();
            this.playSound('phase');
            this.showPhaseFlash('THE GLITCH');
        }
        if (this.score > 150 && this.currentPhase === 2) {
            this.currentPhase = 3;
            this.options.gravity = this.baseGravity * 0.5;
            this.triggerShake();
            this.playSound('phase');
            this.showPhaseFlash('STARGATE');
        }

        // Phase flash fade
        if (this.phaseFlashAlpha > 0) {
            this.phaseFlashAlpha -= 0.015;
        }

        // Horizontal movement
        const horizontalSpeed = 4;
        if (this.ninja.movingLeft) {
            this.ninja.x -= horizontalSpeed;
            if (this.ninja.x < 0) this.ninja.x = 0;
        }
        if (this.ninja.movingRight) {
            this.ninja.x += horizontalSpeed;
            if (this.ninja.x > this.canvas.width - this.ninja.width) {
                this.ninja.x = this.canvas.width - this.ninja.width;
            }
        }

        // Ninja physics (skip in UFO mode)
        this.onSatellite = false;
        if (this.playerState === 'ufo') {
            this.updateUfo();
        } else {
            this.ninja.dy += this.options.gravity;
            this.ninja.y += this.ninja.dy;

            const maxY = this.groundY - this.ninja.height;
            if (this.ninja.y > maxY) {
                this.ninja.y = maxY;
                this.ninja.dy = 0;
            }
        }

        // Running animation
        if (this.frameCount % 6 === 0) {
            this.ninja.runFrame = (this.ninja.runFrame + 1) % 2;
        }

        // Ground scroll
        this.groundOffset = (this.groundOffset + this.currentSpeed) % 200;

        if (this.gameMode === 'fullscreen' && !this.whaleEvent.active && this.currentPhase >= 2 && Math.random() < 0.0015) {
            this.startWhaleEvent();
        }
        this.updateWhaleEvent();

        // Move stars (parallax, faster in Phase 3)
        this.stars.forEach(s => {
            s.x -= this.currentSpeed * (this.currentPhase === 3 ? 1 : 0.2);
            if (s.x < 0) s.x = this.canvas.width;
        });

        // Move ground bumps
        this.groundBumps.forEach(bump => {
            bump.x -= this.currentSpeed;
        });
        this.groundBumps = this.groundBumps.filter(b => b.x > -20);
        if (this.groundBumps.length < 10) {
            const lastX = this.groundBumps.length > 0 ? Math.max(...this.groundBumps.map(b => b.x)) : this.canvas.width;
            if (Math.random() > 0.5) {
                this.groundBumps.push({
                    x: lastX + 20 + Math.random() * 30,
                    type: Math.random() > 0.5 ? 'hill' : 'rock',
                    width: 8 + Math.random() * 6,
                    size: 1 + Math.floor(Math.random() * 2)
                });
            }
        }

        // Spawn obstacles (faster in later phases)
        if (this.nextObstacleTimer <= 0) {
            this.spawnObstacle();
            this.nextObstacleTimer = Math.random() * 60 + 50 - (this.currentPhase * 5);
        }
        this.nextObstacleTimer--;

        // Update obstacles
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            const obs = this.obstacles[i];
            obs.x -= this.currentSpeed;

            // Collision detection
            const hitboxShrink = 5;

            // --- FORGIVING SATELLITE CATAPULT LOGIC ---
            // Turn satellites into one-way platforms: bounce from above, pass through from below
            if (this.gameMode === 'fullscreen' && obs.type === 'satellite' && this.playerState !== 'ufo') {
                const isOverlappingHorizontally = this.ninja.x < obs.x + obs.width && this.ninja.x + this.ninja.width > obs.x;
                const ninjaBottom = this.ninja.y + this.ninja.height;

                if (isOverlappingHorizontally) {
                    const isOverlappingVertically = ninjaBottom >= obs.y && ninjaBottom <= obs.y + obs.height * 0.8;

                    if (this.ninja.dy >= -1 && isOverlappingVertically) {
                        // Catapult bounce automatically off satellite! No matter where we hit it on the way down.
                        this.ninja.y = obs.y - this.ninja.height; // Set right on top
                        this.ninja.dy = this.options.jumpStrength * 1.6; // 1.6x catapult multiplier
                        
                        this.spawnDustParticles();
                        this.spawnDustParticles(); 
                        this.playSound('jump');
                        
                        this.score += 2;
                        this.spawnFloatingText('+2 BOUNCE!', this.ninja.x, this.ninja.y - 10, '#0ff');
                        continue; // Skip standard death collision check below
                    } else if (this.ninja.dy < -1) {
                        // Pass through from below (one-way platform behavior)
                        // This prevents fatal collisions when jumping up through a satellite
                        continue; 
                    }
                }
            }

            // --- STANDARD OBSTACLE FATAL COLLISION ---
            if (
                this.ninja.x + hitboxShrink < obs.x + obs.width - hitboxShrink &&
                this.ninja.x + this.ninja.width - hitboxShrink > obs.x + hitboxShrink &&
                this.ninja.y + hitboxShrink < obs.y + obs.height - hitboxShrink &&
                this.ninja.y + this.ninja.height - hitboxShrink > obs.y + hitboxShrink
            ) {
                if (this.playerState === 'ufo' && this.ufo.shieldActive) {
                    const smashPts = 5;
                    this.score += smashPts;
                    this.spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2);
                    this.spawnFloatingText(`+${smashPts} SMASH!`, obs.x, obs.y - 6, '#8ff');
                    this.playSound('explosion');
                    this.triggerShake();
                    this.obstacles.splice(i, 1);
                } else if (this.playerState === 'ufo' && this.ufo.health > 0) {
                    this.ufo.health--;
                    this.obstacles.splice(i, 1);
                    this.spawnExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2);
                    this.playSound('explosion');
                    this.triggerShake();
                    if (this.ufo.health <= 0) {
                        this.exitUfo();
                    }
                } else {
                    this.obstacles.splice(i, 1);
                    this.takeLifeHit(obs);
                }
            }

            if (obs.x < -50) {
                this.obstacles.splice(i, 1);
                this.score++;
                if (this.gameMode === 'fullscreen') {
                    this.checkCloseCall(obs);
                    this.spawnFloatingText('+1', this.ninja.x + 10, this.ninja.y - 8, '#fff');
                }
                this.playSound('score');
            }
        }

        // Fullscreen-only extended mechanics
        if (this.gameMode === 'fullscreen') {
            // Spawn weapon pickups
            this.pickupTimer++;
            if (this.pickupTimer > 400 + Math.random() * 600) {
                this.spawnPickup();
                this.pickupTimer = 0;
            }

            // Spawn UFO pickups (rare)
            this.ufoPickupTimer++;
            if (this.ufoPickupTimer > 2000 + Math.random() * 1500) {
                this.spawnUfoPickup();
                this.ufoPickupTimer = 0;
            }

            this.abductionTimer++;
            if (this.abductionTimer > 1800 + Math.random() * 1800) {
                this.spawnAbductionBeam();
                this.abductionTimer = 0;
            }

            this.extraLifeTimer++;
            if (this.extraLifeTimer > 2200 + Math.random() * 2400) {
                this.spawnExtraLifePickup();
                this.extraLifeTimer = 0;
            }

            this.ramenPickupTimer++;
            if (this.ramenPickupTimer > 700 + Math.random() * 900) {
                this.spawnRamenPickup();
                this.ramenPickupTimer = 0;
            }

            if (this.playerState === 'ufo' && !this.ufo.shieldActive) {
                this.shieldPickupTimer++;
                if (this.shieldPickupTimer > 360 + Math.random() * 420) {
                    this.spawnShieldPickup();
                    this.shieldPickupTimer = 0;
                }
            } else {
                this.shieldPickupTimer = 0;
            }

            this.updatePickups();
            this.updateUfoPickups();
            this.updateShieldPickups();
            this.updateRamenPickups();
            this.updateAbductionBeams();
            this.updateExtraLifePickups();
            this.updateProjectiles();
            this.updateExplosions();
            this.updateFloatingTexts();

            // UFO fires manually via Z key (no auto-fire)
        }

        // Phase 2: random glitch
        if (this.currentPhase === 2 && Math.random() < 0.01) {
            this.triggerGlitch();
        }

        // Particles
        this.updateParticles();

        // Speed up
        this.currentSpeed += 0.0005;
    }

    // --- PIXEL ART DRAWING ---

    drawPixel(x, y, size = 2) {
        this.ctx.fillRect(x, y, size, size);
    }

    drawStars() {
        this.stars.forEach(star => {
            if (star.twinkle < 90 || star.size === 2) {
                this.ctx.fillStyle = this.isDarkMode
                    ? `rgba(255, 255, 255, ${0.3 + (star.twinkle % 50) / 100})`
                    : `rgba(83, 83, 83, ${0.2 + (star.twinkle % 50) / 150})`;
                this.ctx.fillRect(star.x, star.y, star.size, star.size);
            }
        });
    }

    drawParallaxBackground() {
        if (this.bonusRound.active) {
            this.ctx.fillStyle = '#220022';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            for (let i = 0; i < 14; i++) {
                const x = (this.frameCount * 3 + i * 70) % (this.canvas.width + 80);
                this.ctx.strokeStyle = 'rgba(255, 105, 255, 0.25)';
                this.ctx.strokeRect(this.canvas.width - x, 12 + (i % 5) * 26, 24, 24);
            }
            return;
        }

        if (this.currentPhase < 3) {
            this.ctx.fillStyle = 'rgba(0, 255, 150, 0.06)';
            for (let i = 0; i < 6; i++) {
                const x = -((this.frameCount * 0.12) + i * 160) % (this.canvas.width + 140);
                this.ctx.fillRect(x, this.groundY - 58 - (i % 2) * 8, 34, 46);
                this.ctx.fillRect(x + 10, this.groundY - 76 - (i % 3) * 6, 10, 18);
            }

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            for (let i = 0; i < 7; i++) {
                const baseX = -((this.frameCount * 0.35) + i * 120) % (this.canvas.width + 120);
                this.ctx.beginPath();
                this.ctx.moveTo(baseX, this.groundY);
                this.ctx.lineTo(baseX + 26, this.groundY - 22 - (i % 3) * 4);
                this.ctx.lineTo(baseX + 54, this.groundY);
                this.ctx.fill();
            }
        } else {
            for (let i = 0; i < 10; i++) {
                const x = (this.frameCount * 2.5 + i * 90) % (this.canvas.width + 60);
                const y = 24 + (i % 5) * 34;
                this.ctx.strokeStyle = 'rgba(0, 255, 150, 0.18)';
                this.ctx.strokeRect(this.canvas.width - x, y, 10 + (i % 3) * 6, 10 + (i % 3) * 6);
            }
        }
    }

    drawAbductionBeam(beam) {
        const pulse = 0.5 + Math.sin(beam.glow) * 0.5;
        const grad = this.ctx.createLinearGradient(beam.x, beam.y, beam.x, beam.y + beam.height);
        grad.addColorStop(0, `rgba(255, 80, 255, ${0.55 + pulse * 0.2})`);
        grad.addColorStop(1, 'rgba(255, 80, 255, 0.08)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(beam.x, beam.y, beam.width, beam.height);
        this.ctx.strokeStyle = 'rgba(255,160,255,0.55)';
        this.ctx.strokeRect(beam.x, beam.y, beam.width, beam.height);
    }

    drawBonusCoins() {
        this.bonusRound.coins.forEach((coin) => {
            const pulse = 0.5 + Math.sin(coin.glow) * 0.5;
            this.ctx.fillStyle = `rgba(255, 120, 255, ${0.7 + pulse * 0.3})`;
            this.ctx.fillRect(coin.x, coin.y, 8, 8);
            this.ctx.fillStyle = '#fff';
            this.ctx.fillRect(coin.x + 2, coin.y + 2, 4, 4);
        });
    }

    drawNinja() {
        if (this.invulnerableTimer > 0 && this.frameCount % 6 < 3) return;
        this.ctx.fillStyle = this.color;
        const x = this.ninja.x;
        const y = this.ninja.y;
        const p = 2;

        if (this.ninja.ducking) {
            this.drawPixel(x + 6, y, p); this.drawPixel(x + 8, y, p); this.drawPixel(x + 10, y, p);
            this.drawPixel(x + 4, y + 2, p); this.drawPixel(x + 6, y + 2, p); this.drawPixel(x + 8, y + 2, p);
            this.drawPixel(x + 10, y + 2, p); this.drawPixel(x + 12, y + 2, p);
            this.drawPixel(x + 14, y + 2, p);
            for (let i = 0; i < 7; i++) this.drawPixel(x + 2 + i * p, y + 4, p);
            for (let i = 0; i < 5; i++) this.drawPixel(x + 4 + i * p, y + 6, p);
            this.drawPixel(x + 4, y + 8, p); this.drawPixel(x + 12, y + 8, p);
        } else if (!this.gameStarted) {
            this.drawPixel(x + 6, y, p); this.drawPixel(x + 8, y, p); this.drawPixel(x + 10, y, p);
            this.drawPixel(x + 4, y + 2, p); this.drawPixel(x + 6, y + 2, p); this.drawPixel(x + 8, y + 2, p);
            this.drawPixel(x + 10, y + 2, p); this.drawPixel(x + 12, y + 2, p);
            this.drawPixel(x + 14, y + 2, p);
            this.drawPixel(x + 16, this.ninja.idleFrame === 0 ? y : y + 2, p);
            this.drawPixel(x + 6, y + 4, p); this.drawPixel(x + 8, y + 4, p);
            for (let i = 0; i < 4; i++) this.drawPixel(x + 4 + i * p, y + 6, p);
            for (let i = 0; i < 4; i++) this.drawPixel(x + 4 + i * p, y + 8, p);
            this.drawPixel(x + 2, y + 6, p); this.drawPixel(x + 2, y + 8, p);
            this.drawPixel(x + 12, y + 6, p); this.drawPixel(x + 12, y + 8, p);
            for (let i = 0; i < 4; i++) this.drawPixel(x + 4 + i * p, y + 10, p);
            this.drawPixel(x + 4, y + 12, p); this.drawPixel(x + 6, y + 12, p);
            this.drawPixel(x + 8, y + 12, p); this.drawPixel(x + 10, y + 12, p);
            this.drawPixel(x + 4, y + 14, p); this.drawPixel(x + 10, y + 14, p);
            this.drawPixel(x + 4, y + 16, p); this.drawPixel(x + 10, y + 16, p);
            this.drawPixel(x + 4, y + 18, p); this.drawPixel(x + 10, y + 18, p);
        } else {
            this.drawPixel(x + 6, y, p); this.drawPixel(x + 8, y, p); this.drawPixel(x + 10, y, p);
            this.drawPixel(x + 4, y + 2, p); this.drawPixel(x + 6, y + 2, p); this.drawPixel(x + 8, y + 2, p);
            this.drawPixel(x + 10, y + 2, p); this.drawPixel(x + 12, y + 2, p);
            this.drawPixel(x + 14, y + 2, p); this.drawPixel(x + 16, y, p); this.drawPixel(x + 18, y - 2, p);
            this.drawPixel(x + 6, y + 4, p); this.drawPixel(x + 8, y + 4, p);
            for (let i = 0; i < 4; i++) this.drawPixel(x + 4 + i * p, y + 6, p);
            for (let i = 0; i < 4; i++) this.drawPixel(x + 4 + i * p, y + 8, p);
            this.drawPixel(x + 2, y + 8, p); this.drawPixel(x + 12, y + 6, p);
            for (let i = 0; i < 4; i++) this.drawPixel(x + 4 + i * p, y + 10, p);
            if (this.ninja.dy !== 0) {
                this.drawPixel(x + 6, y + 12, p); this.drawPixel(x + 8, y + 12, p);
                this.drawPixel(x + 4, y + 14, p); this.drawPixel(x + 10, y + 14, p);
                this.drawPixel(x + 4, y + 16, p); this.drawPixel(x + 10, y + 16, p);
                this.drawPixel(x + 6, y + 18, p); this.drawPixel(x + 8, y + 18, p);
            } else if (this.ninja.runFrame === 0) {
                this.drawPixel(x + 4, y + 12, p); this.drawPixel(x + 10, y + 12, p);
                this.drawPixel(x + 2, y + 14, p); this.drawPixel(x + 12, y + 14, p);
                this.drawPixel(x + 2, y + 16, p); this.drawPixel(x + 12, y + 16, p);
                this.drawPixel(x + 2, y + 18, p); this.drawPixel(x + 10, y + 18, p);
            } else {
                this.drawPixel(x + 6, y + 12, p); this.drawPixel(x + 8, y + 12, p);
                this.drawPixel(x + 4, y + 14, p); this.drawPixel(x + 10, y + 14, p);
                this.drawPixel(x + 4, y + 16, p); this.drawPixel(x + 10, y + 16, p);
                this.drawPixel(x + 6, y + 18, p); this.drawPixel(x + 8, y + 18, p);
            }
        }
    }

    drawRocket(obs) {
        this.ctx.fillStyle = this.color;
        const x = obs.x;
        const y = obs.y;
        const p = 2;

        this.drawPixel(x + 5, y, p);
        this.drawPixel(x + 3, y + 2, p); this.drawPixel(x + 5, y + 2, p); this.drawPixel(x + 7, y + 2, p);
        for (let row = 0; row < 7; row++) {
            this.drawPixel(x + 3, y + 4 + row * p, p);
            this.drawPixel(x + 5, y + 4 + row * p, p);
            this.drawPixel(x + 7, y + 4 + row * p, p);
        }
        this.ctx.fillStyle = this.isDarkMode ? '#333' : '#fff';
        this.drawPixel(x + 5, y + 6, p);
        this.ctx.fillStyle = this.color;
        this.drawPixel(x + 1, y + obs.height - 6, p); this.drawPixel(x + 9, y + obs.height - 6, p);
        this.drawPixel(x + 1, y + obs.height - 4, p); this.drawPixel(x + 9, y + obs.height - 4, p);
        this.drawPixel(x + 1, y + obs.height - 2, p); this.drawPixel(x + 9, y + obs.height - 2, p);
        if (this.frameCount % 10 < 5) {
            this.drawPixel(x + 5, y + obs.height, p);
        } else {
            this.drawPixel(x + 3, y + obs.height, p);
            this.drawPixel(x + 7, y + obs.height, p);
        }
    }

    drawSatellite(obs) {
        this.ctx.fillStyle = this.color;
        const x = obs.x;
        const y = obs.y;
        const p = 2;

        for (let row = 0; row < 3; row++) {
            this.drawPixel(x, y + 2 + row * p, p);
            this.drawPixel(x + 2, y + 2 + row * p, p);
        }
        this.drawPixel(x + 4, y + 4, p);
        for (let row = 0; row < 3; row++) {
            this.drawPixel(x + 6, y + row * p, p);
            this.drawPixel(x + 8, y + row * p, p);
            this.drawPixel(x + 10, y + row * p, p);
        }
        this.drawPixel(x + 12, y + 4, p);
        for (let row = 0; row < 3; row++) {
            this.drawPixel(x + 14, y + 2 + row * p, p);
            this.drawPixel(x + 16, y + 2 + row * p, p);
        }
        this.drawPixel(x + 8, y - 2, p); this.drawPixel(x + 8, y - 4, p);
        this.drawPixel(x + 6, y - 6, p); this.drawPixel(x + 8, y - 6, p); this.drawPixel(x + 10, y - 6, p);
    }

    drawGround() {
        this.ctx.fillStyle = this.color;
        this.ctx.fillRect(0, this.groundY, this.canvas.width, 1);

        this.groundBumps.forEach(bump => {
            if (bump.type === 'hill') {
                this.drawPixel(bump.x, this.groundY - 2, 2);
                this.drawPixel(bump.x + 2, this.groundY - 4, 2);
                this.drawPixel(bump.x + 4, this.groundY - 4, 2);
                this.drawPixel(bump.x + 6, this.groundY - 2, 2);
            } else if (bump.type === 'rock') {
                const s = bump.size || 1;
                this.ctx.fillRect(bump.x, this.groundY + 2, s * 2, s);
            }
        });

        for (let i = -this.groundOffset % 30; i < this.canvas.width; i += 30) {
            this.ctx.fillRect(i, this.groundY + 3, 1, 1);
            this.ctx.fillRect(i + 12, this.groundY + 5, 2, 1);
            this.ctx.fillRect(i + 22, this.groundY + 2, 1, 1);
        }
    }

    drawWormhole() {
        this.warpRingRadius = (this.warpRingRadius + 5) % this.canvas.width;
        for (let i = 0; i < 5; i++) {
            const r = (this.warpRingRadius + i * 80) % this.canvas.width;
            this.ctx.strokeStyle = `rgba(0, 255, 150, ${Math.random() * 0.3 + 0.1})`;
            this.ctx.lineWidth = 1;
            this.ctx.beginPath();
            this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, r, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    drawFullscreenIcon() {
        const ctx = this.ctx;
        // Make icon slightly larger and more visible
        const s = this.isFullscreen ? 16 : 14;
        const pad = 8;
        const x = this.canvas.width - s - pad;
        const y = pad;

        // Bright white with a soft glow
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 4;

        if (this.isFullscreen) {
            // Collapse icon (arrows pointing inward)
            const m = 4;
            // Top-left corner inward
            ctx.beginPath();
            ctx.moveTo(x, y + m); ctx.lineTo(x + m, y + m); ctx.lineTo(x + m, y);
            ctx.stroke();
            // Top-right corner inward
            ctx.beginPath();
            ctx.moveTo(x + s, y + m); ctx.lineTo(x + s - m, y + m); ctx.lineTo(x + s - m, y);
            ctx.stroke();
            // Bottom-left corner inward
            ctx.beginPath();
            ctx.moveTo(x, y + s - m); ctx.lineTo(x + m, y + s - m); ctx.lineTo(x + m, y + s);
            ctx.stroke();
            // Bottom-right corner inward
            ctx.beginPath();
            ctx.moveTo(x + s, y + s - m); ctx.lineTo(x + s - m, y + s - m); ctx.lineTo(x + s - m, y + s);
            ctx.stroke();
        } else {
            // Expand icon (corners pointing outward)
            const m = 4;
            // Top-left corner
            ctx.beginPath();
            ctx.moveTo(x, y + m); ctx.lineTo(x, y); ctx.lineTo(x + m, y);
            ctx.stroke();
            // Top-right corner
            ctx.beginPath();
            ctx.moveTo(x + s, y + m); ctx.lineTo(x + s, y); ctx.lineTo(x + s - m, y);
            ctx.stroke();
            // Bottom-left corner
            ctx.beginPath();
            ctx.moveTo(x, y + s - m); ctx.lineTo(x, y + s); ctx.lineTo(x + m, y + s);
            ctx.stroke();
            // Bottom-right corner
            ctx.beginPath();
            ctx.moveTo(x + s, y + s - m); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s - m, y + s);
            ctx.stroke();
        }
        ctx.shadowBlur = 0;
    }

    // --- EXTENDED MODE DRAWING (fullscreen only) ---

    drawWeaponPickup(p) {
        const pulse = 0.5 + Math.sin(p.glow) * 0.5;
        const spin = Math.floor(p.glow * 2) % 2;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + pulse * 0.3})`;
        this.ctx.shadowColor = '#fff';
        this.ctx.shadowBlur = 5 + pulse * 6;
        const cx = p.x + p.width / 2;
        const cy = p.y + p.height / 2;
        const s = 2;
        // Shuriken (throwing star) shape
        this.drawPixel(cx, cy, s);
        if (spin === 0) {
            // 4-pointed star orientation A
            this.drawPixel(cx - 4, cy - 2, s); this.drawPixel(cx - 2, cy - 4, s);
            this.drawPixel(cx + 4, cy - 2, s); this.drawPixel(cx + 2, cy - 4, s);
            this.drawPixel(cx - 4, cy + 2, s); this.drawPixel(cx - 2, cy + 4, s);
            this.drawPixel(cx + 4, cy + 2, s); this.drawPixel(cx + 2, cy + 4, s);
            this.drawPixel(cx - 2, cy, s); this.drawPixel(cx + 2, cy, s);
            this.drawPixel(cx, cy - 2, s); this.drawPixel(cx, cy + 2, s);
        } else {
            // 4-pointed star orientation B (rotated)
            this.drawPixel(cx - 4, cy, s); this.drawPixel(cx + 4, cy, s);
            this.drawPixel(cx, cy - 4, s); this.drawPixel(cx, cy + 4, s);
            this.drawPixel(cx - 2, cy - 2, s); this.drawPixel(cx + 2, cy - 2, s);
            this.drawPixel(cx - 2, cy + 2, s); this.drawPixel(cx + 2, cy + 2, s);
            this.drawPixel(cx - 2, cy, s); this.drawPixel(cx + 2, cy, s);
            this.drawPixel(cx, cy - 2, s); this.drawPixel(cx, cy + 2, s);
        }
        this.ctx.shadowBlur = 0;
    }

    drawUfoPickupSprite(u) {
        const pulse = 0.5 + Math.sin(u.glow) * 0.5;
        const x = u.x;
        const y = u.y;
        const p = 2;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.7 + pulse * 0.3})`;
        this.ctx.shadowColor = '#fff';
        this.ctx.shadowBlur = 6 + pulse * 8;
        // Dome
        this.drawPixel(x + 8, y, p); this.drawPixel(x + 10, y, p); this.drawPixel(x + 12, y, p);
        this.drawPixel(x + 6, y + 2, p); this.drawPixel(x + 8, y + 2, p); this.drawPixel(x + 10, y + 2, p); this.drawPixel(x + 12, y + 2, p); this.drawPixel(x + 14, y + 2, p);
        // Body
        for (let i = 0; i < 11; i++) this.drawPixel(x + i * p, y + 4, p);
        for (let i = 0; i < 9; i++) this.drawPixel(x + 2 + i * p, y + 6, p);
        for (let i = 0; i < 5; i++) this.drawPixel(x + 6 + i * p, y + 8, p);
        // Landing gear
        this.drawPixel(x + 4, y + 10, p); this.drawPixel(x + 16, y + 10, p);
        // "!" indicator
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 10px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('!', x + 11, y - 6);
        this.ctx.shadowBlur = 0;
    }

    drawShieldPickup(p) {
        const pulse = 0.5 + Math.sin(p.glow) * 0.5;
        const x = p.x;
        const y = p.y;
        const s = 2;
        this.ctx.strokeStyle = `rgba(120, 255, 255, ${0.7 + pulse * 0.3})`;
        this.ctx.lineWidth = 1;
        this.ctx.shadowColor = '#8ff';
        this.ctx.shadowBlur = 8 + pulse * 6;
        this.ctx.strokeRect(x, y, 10, 10);
        this.ctx.fillStyle = '#8ff';
        this.drawPixel(x + 4, y + 2, s);
        this.drawPixel(x + 2, y + 4, s);
        this.drawPixel(x + 6, y + 4, s);
        this.drawPixel(x + 4, y + 6, s);
        this.ctx.shadowBlur = 0;
    }

    drawRamenPickup(p) {
        const pulse = 0.5 + Math.sin(p.glow) * 0.5;
        const x = p.x;
        const y = p.y;
        const s = 2;
        this.ctx.fillStyle = `rgba(255, 240, 140, ${0.8 + pulse * 0.2})`;
        this.ctx.shadowColor = '#ff0';
        this.ctx.shadowBlur = 6 + pulse * 4;
        this.drawPixel(x + 2, y + 2, s); this.drawPixel(x + 4, y + 2, s); this.drawPixel(x + 6, y + 2, s);
        this.drawPixel(x, y + 4, s); this.drawPixel(x + 2, y + 4, s); this.drawPixel(x + 4, y + 4, s); this.drawPixel(x + 6, y + 4, s); this.drawPixel(x + 8, y + 4, s);
        this.drawPixel(x, y + 6, s); this.drawPixel(x + 8, y + 6, s);
        this.ctx.fillStyle = '#fff';
        this.drawPixel(x + 2, y, s); this.drawPixel(x + 6, y, s);
        this.ctx.shadowBlur = 0;
    }

    drawExtraLifePickup(p) {
        const pulse = 0.5 + Math.sin(p.glow) * 0.5;
        const x = p.x;
        const y = p.y;
        const s = 2;
        this.ctx.fillStyle = `rgba(140, 255, 160, ${0.75 + pulse * 0.25})`;
        this.ctx.shadowColor = '#0f6';
        this.ctx.shadowBlur = 6 + pulse * 6;
        this.drawPixel(x + 4, y, s);
        this.drawPixel(x + 2, y + 2, s); this.drawPixel(x + 4, y + 2, s); this.drawPixel(x + 6, y + 2, s);
        for (let i = 0; i < 5; i++) this.drawPixel(x + i * 2, y + 4, s);
        this.drawPixel(x + 2, y + 6, s); this.drawPixel(x + 6, y + 6, s);
        this.drawPixel(x + 4, y + 8, s);
        this.ctx.shadowBlur = 0;
    }

    drawUfoPlayer() {
        const x = this.ninja.x;
        const y = this.ninja.y;
        const p = 2;
        const pulse = Math.sin(this.frameCount * 0.15) * 0.2;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.85 + pulse})`;
        this.ctx.shadowColor = '#fff';
        this.ctx.shadowBlur = 10;
        // Dome
        this.drawPixel(x + 8, y, p); this.drawPixel(x + 10, y, p); this.drawPixel(x + 12, y, p);
        this.drawPixel(x + 6, y + 2, p); this.drawPixel(x + 8, y + 2, p); this.drawPixel(x + 10, y + 2, p); this.drawPixel(x + 12, y + 2, p); this.drawPixel(x + 14, y + 2, p);
        // Body (wider)
        for (let i = 0; i < 12; i++) this.drawPixel(x + i * p, y + 4, p);
        for (let i = 0; i < 10; i++) this.drawPixel(x + 2 + i * p, y + 6, p);
        for (let i = 0; i < 6; i++) this.drawPixel(x + 6 + i * p, y + 8, p);
        // Engine flames
        if (this.frameCount % 6 < 3) {
            this.ctx.fillStyle = '#fff';
            this.drawPixel(x + 6, y + 10, p); this.drawPixel(x + 16, y + 10, p);
            this.drawPixel(x + 8, y + 12, p); this.drawPixel(x + 14, y + 12, p);
        } else {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            this.drawPixel(x + 8, y + 10, p); this.drawPixel(x + 14, y + 10, p);
        }
        if (this.ufo.shieldActive) {
            this.ctx.strokeStyle = `rgba(140, 255, 255, ${0.45 + Math.sin(this.frameCount * 0.15) * 0.2})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.ellipse(x + 12, y + 8, 18, 12, 0, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        this.ctx.shadowBlur = 0;
    }

    drawProjectiles() {
        this.projectiles.forEach(proj => {
            const color = proj.fromUfo ? '#fff' : '#ff0';
            this.ctx.fillStyle = color;
            this.ctx.shadowColor = color;
            this.ctx.shadowBlur = 4;
            this.ctx.fillRect(proj.x, proj.y, 6, 2);
            this.ctx.fillStyle = `${color}66`;
            this.ctx.fillRect(proj.x - 4, proj.y, 4, 2);
            this.ctx.fillStyle = `${color}33`;
            this.ctx.fillRect(proj.x - 8, proj.y, 4, 2);
            this.ctx.shadowBlur = 0;
        });
    }

    drawExplosions() {
        this.explosions.forEach(e => {
            const alpha = Math.max(0, e.life / 35);
            this.ctx.fillStyle = e.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
            this.ctx.fillRect(e.x, e.y, e.size, e.size);
        });
    }

    drawFloatingTexts() {
        this.floatingTexts.forEach(ft => {
            const alpha = Math.max(0, ft.life / 40);
            this.ctx.fillStyle = ft.color;
            this.ctx.globalAlpha = alpha;
            this.ctx.font = this.isFullscreen ? 'bold 12px monospace' : '8px monospace';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(ft.text, ft.x, ft.y);
            this.ctx.globalAlpha = 1;
        });
    }

    drawExtendedHud() {
        if (this.gameMode !== 'fullscreen' || !this.gameStarted || this.isGameOver) return;
        const ctx = this.ctx;
        const hudY = this.isFullscreen ? 40 : 20;
        ctx.fillStyle = '#0f6';
        ctx.font = this.isFullscreen ? '11px monospace' : '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`LIVES ${'♥'.repeat(this.lives)}${'·'.repeat(Math.max(0, this.maxLives - this.lives))}`, 6, hudY + 20);
        if (this.bonusRound.active) {
            const pct = this.bonusRound.timer / 600;
            const barW = this.isFullscreen ? 120 : 60;
            ctx.fillStyle = 'rgba(255, 80, 255, 0.2)';
            ctx.fillRect(6, hudY - 8, barW, 6);
            ctx.fillStyle = '#f8f';
            ctx.fillRect(6, hudY - 8, barW * pct, 6);
            ctx.strokeStyle = '#f8f';
            ctx.strokeRect(6, hudY - 8, barW, 6);
            ctx.fillStyle = '#f8f';
            ctx.font = this.isFullscreen ? '10px monospace' : '7px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('BONUS DIMENSION', barW + 10, hudY - 2);
            return;
        }
        if (this.playerState === 'armed') {
            ctx.fillStyle = '#ff0';
            ctx.font = this.isFullscreen ? '12px monospace' : '8px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`AMMO: ${'■'.repeat(this.weapon.ammo)}${'□'.repeat(5 - this.weapon.ammo)}`, 6, hudY);
        }
        if (this.playerState === 'ufo') {
            const pct = this.ufo.timer / 600;
            const barW = this.isFullscreen ? 100 : 50;
            ctx.fillStyle = '#0ff44';
            ctx.fillRect(6, hudY - 8, barW, 6);
            ctx.fillStyle = '#0ff';
            ctx.fillRect(6, hudY - 8, barW * pct, 6);
            ctx.strokeStyle = '#0ff';
            ctx.strokeRect(6, hudY - 8, barW, 6);
            ctx.fillStyle = '#0ff';
            ctx.font = this.isFullscreen ? '10px monospace' : '7px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('UFO', barW + 10, hudY - 2);
            if (this.ufo.shieldActive) {
                const shieldPct = this.ufo.shieldTimer / 480;
                ctx.fillStyle = '#8ff44';
                ctx.fillRect(6, hudY + 2, barW, 4);
                ctx.fillStyle = '#8ff';
                ctx.fillRect(6, hudY + 2, barW * shieldPct, 4);
                ctx.strokeStyle = '#8ff';
                ctx.strokeRect(6, hudY + 2, barW, 4);
                ctx.fillStyle = '#8ff';
                ctx.fillText('SHIELD', barW + 10, hudY + 10);
            }
        }
    }

    drawWhaleEvent() {
        if (!this.whaleEvent.active) return;
        const whale = this.whaleEvent;
        const x = whale.x;
        const y = whale.y;
        const p = 2;
        this.ctx.save();
        this.ctx.globalAlpha = 0.88;
        this.ctx.fillStyle = '#d8f8ff';
        this.ctx.shadowColor = '#8ff';
        this.ctx.shadowBlur = 8;

        // chunky pixel whale
        for (let i = 0; i < 12; i++) this.drawPixel(x + 8 + i * p, y + 8, p);
        for (let i = 0; i < 15; i++) this.drawPixel(x + 4 + i * p, y + 10, p);
        for (let i = 0; i < 17; i++) this.drawPixel(x + 2 + i * p, y + 12, p);
        for (let i = 0; i < 16; i++) this.drawPixel(x + 4 + i * p, y + 14, p);
        for (let i = 0; i < 11; i++) this.drawPixel(x + 8 + i * p, y + 16, p);
        this.drawPixel(x + 30, y + 6, p); this.drawPixel(x + 32, y + 4, p); this.drawPixel(x + 34, y + 6, p);
        this.drawPixel(x + 18, y + 18, p); this.drawPixel(x + 20, y + 20, p); this.drawPixel(x + 22, y + 18, p);
        this.drawPixel(x + 2, y + 10, p); this.drawPixel(x, y + 8, p); this.drawPixel(x, y + 14, p);
        this.ctx.fillStyle = '#0f172a';
        this.drawPixel(x + 26, y + 10, p);

        // stardust beam
        const beamX = whale.beamX;
        const beamTop = y + whale.height - 4;
        const beamHeight = this.canvas.height - beamTop;
        const grad = this.ctx.createLinearGradient(beamX, beamTop, beamX, this.canvas.height);
        grad.addColorStop(0, 'rgba(140,255,255,0.55)');
        grad.addColorStop(1, 'rgba(140,255,255,0.05)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(beamX, beamTop, whale.beamWidth, beamHeight);

        for (let i = 0; i < 8; i++) {
            const sparkleY = beamTop + ((this.frameCount * 2) + i * 19) % Math.max(8, beamHeight);
            this.ctx.fillStyle = 'rgba(255,255,255,0.75)';
            this.drawPixel(beamX + (i % 3) * 4, sparkleY, 2);
        }
        this.ctx.restore();
    }

    drawPauseOverlay() {
        if (!this.paused) return;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = '#00ff96';
        this.ctx.textAlign = 'center';
        this.ctx.font = this.isFullscreen ? 'bold 24px monospace' : 'bold 12px monospace';
        this.ctx.fillText('PAUSED', this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.font = this.isFullscreen ? '14px monospace' : '9px monospace';
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText('Press P to resume', this.canvas.width / 2, this.canvas.height / 2 + 24);
    }

    // --- DRAW ---

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();

        // Screen shake
        if (this.screenShake > 0) {
            this.ctx.translate(
                (Math.random() - 0.5) * this.screenShake,
                (Math.random() - 0.5) * this.screenShake
            );
            this.screenShake *= 0.8;
            if (this.screenShake < 0.5) this.screenShake = 0;
        }

        // Background
        if (this.currentPhase === 3) {
            this.drawWormhole();
        } else {
            this.drawStars();
        }
        this.drawParallaxBackground();

        if (this.gameMode === 'fullscreen' && this.whaleEvent.active) {
            this.drawWhaleEvent();
        }

        // Ground (hidden in Phase 3)
        if (this.gameStarted && this.currentPhase !== 3) {
            this.drawGround();
        }

        // Ninja or UFO
        if (this.playerState === 'ufo') {
            this.drawUfoPlayer();
        } else {
            this.drawNinja();
        }

        // Obstacles
        if (this.gameStarted) {
            this.obstacles.forEach(obs => {
                if (obs.type === 'satellite') this.drawSatellite(obs);
                else this.drawRocket(obs);
            });
        }

        if (this.gameMode === 'fullscreen' && this.gameStarted) {
            this.abductionBeams.forEach((beam) => this.drawAbductionBeam(beam));
            if (this.bonusRound.active) this.drawBonusCoins();
        }

        // Particles
        this.drawParticles();

        // Extended mode visuals (fullscreen only)
        if (this.gameMode === 'fullscreen' && this.gameStarted) {
            this.pickups.forEach(p => this.drawWeaponPickup(p));
            this.ufoPickups.forEach(u => this.drawUfoPickupSprite(u));
            this.shieldPickups.forEach(p => this.drawShieldPickup(p));
            this.ramenPickups.forEach(p => this.drawRamenPickup(p));
            this.extraLifePickups.forEach(p => this.drawExtraLifePickup(p));
            this.drawProjectiles();
            this.drawExplosions();
            this.drawFloatingTexts();
        }

        // VHS Glitch
        if (this.isGlitching) {
            const imgData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.putImageData(imgData, -5, 0);
            this.ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.gravityGlitch.active) {
            for (let i = 0; i < 6; i++) {
                const y = (this.frameCount * 9 + i * 23) % this.canvas.height;
                this.ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 0, 255, 0.14)' : 'rgba(0, 255, 255, 0.12)';
                this.ctx.fillRect(0, y, this.canvas.width, 3);
            }
        }

        this.ctx.restore();

        // --- HUD (not affected by shake/glitch) ---

        if (this.gameStarted) {
            this.ctx.fillStyle = this.color;
            this.ctx.font = this.isFullscreen ? 'bold 16px monospace' : '10px monospace';

            if (this.isGameOver) {
                this.ctx.textAlign = 'center';
                const cy = this.canvas.height / 2;
                this.ctx.fillText('GAME OVER', this.canvas.width / 2, cy - 8);
                this.ctx.fillText(
                    `HI ${String(this.highScore).padStart(5, '0')}  ${String(this.score).padStart(5, '0')}`,
                    this.canvas.width / 2, cy + (this.isFullscreen ? 14 : 4)
                );
            } else {
                this.ctx.textAlign = 'right';
                const phaseLabel = this.currentPhase > 1 ? `PHASE ${this.currentPhase} | ` : '';
                this.ctx.fillText(
                    `${phaseLabel}HI ${String(this.highScore).padStart(5, '0')}  ${String(this.score).padStart(5, '0')}`,
                    this.canvas.width - 28, this.isFullscreen ? 24 : 12
                );
                this.ctx.textAlign = 'left';
                this.ctx.fillText(
                    `${'♥'.repeat(this.lives)}`,
                    8, this.isFullscreen ? 24 : 12
                );
            }

            // Phase transition flash
            if (this.phaseFlashAlpha > 0) {
                this.ctx.save();
                this.ctx.textAlign = 'center';
                this.ctx.font = this.isFullscreen ? 'bold 28px monospace' : 'bold 14px monospace';
                this.ctx.fillStyle = `rgba(0, 255, 150, ${this.phaseFlashAlpha})`;
                this.ctx.fillText(this.phaseFlashText, this.canvas.width / 2, this.canvas.height / 2);
                this.ctx.restore();
            }
        } else {
            this.ctx.fillStyle = this.color;
            this.ctx.textAlign = 'center';
            this.ctx.font = this.isFullscreen ? '16px monospace' : '10px monospace';
            this.ctx.fillText(
                this.isFullscreen ? 'CLICK TO INITIATE PROTOCOL' : 'CLICK TO PLAY',
                this.canvas.width / 2,
                this.canvas.height / 2
            );
        }

        // Fullscreen expand/collapse icon
        if (!this.options.standalone) {
            this.drawFullscreenIcon();
        }

        // Extended HUD (ammo, UFO timer)
        this.drawExtendedHud();

        // Pause overlay
        this.drawPauseOverlay();
    }

    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// --- AUTO-INITIALIZATION FOR html2md ---
(function () {
    function setupNinjaRunner() {
        const nav = document.querySelector('.top-nav');
        if (!nav || document.querySelector('#ninja-container')) return;

        const container = document.createElement('div');
        container.id = 'ninja-container';
        container.style.cssText = `
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 400px;
      height: 50px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.3s;
      z-index: 10;
      pointer-events: none;
    `;

        container.addEventListener('mouseenter', () => container.style.opacity = '1');
        container.addEventListener('mouseleave', () => container.style.opacity = '0.7');

        nav.style.position = 'relative';
        Array.from(nav.children).forEach(child => {
            child.style.position = 'relative';
            child.style.zIndex = '5';
        });

        nav.insertBefore(container, nav.firstChild);

        const runner = new NinjaRunner('#ninja-container', {
            speed: 2.5,
            jumpStrength: -9
        });
        if (runner) {
            runner.gameMode = 'header';
            window.__ninjaRunner = runner;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupNinjaRunner);
    } else {
        setupNinjaRunner();
    }

    window.addEventListener('load', setupNinjaRunner);
})();
