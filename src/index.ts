import { Application, Sprite, Texture, TilingSprite } from 'pixi.js';
import { environment } from "./environments/environment";

(window as any).Telegram.WebApp.expand();

const GAME_HEIGHT = 600;
const GAP_MIN = 125;
const GAP_MAX = 175;
const GAP_START = GAME_HEIGHT / 6;
const GAP_END = GAME_HEIGHT - GAP_START - GAP_MAX;
const PIPE_INTERVAL_ACCEL = -0.04;
const PIPE_VELOCITY_ACCEL = -0.001;
const JUMP_VELOCITY = -6;
const GRAVITY = 0.2;
const JUMP_COOLDOWN = 20;
const FLAP_THRESH = -JUMP_VELOCITY / 6;
const PIPE_SCALE = 1.5;
const PIPE_WIDTH = 52 * PIPE_SCALE;
const BACKGROUND_HEIGHT = 512;

class Game {
    app: Application;

    pipeGreenTex!: Texture;
    pipeRedTex!: Texture;
    pipesTex!: Record<string, Texture>;
    birdMidTex!: Texture;
    birdUpTex!: Texture;
    birdDownTex!: Texture;
    backgroundTex!: Texture;

    RATIO: number;
    REAL_GAME_WIDTH: number;

    pipes: { p1: Sprite, p2: Sprite, counted: boolean }[] = [];
    pipeVelocity = -1;
    pipeInterval = 3000;
    lastPipeSpawned = 0;
    score = 0;
    birdVelocity = 0;
    lastJump = 0;

    bird!: Sprite;

    async loadTextures() {
        this.pipeGreenTex = await Texture.fromURL('assets/pipe-green.png');
        this.pipeRedTex = await Texture.fromURL('assets/pipe-red.png');
        this.pipesTex = {
            'pipe-green': this.pipeGreenTex,
            'pipe-red': this.pipeRedTex,
        };
        this.birdMidTex = await Texture.fromURL('assets/bluebird-midflap.png');
        this.birdUpTex = await Texture.fromURL('assets/bluebird-upflap.png');
        this.birdDownTex = await Texture.fromURL('assets/bluebird-downflap.png');
        this.backgroundTex = await Texture.fromURL('assets/background-day.png');
    }

    constructor() {
        this.app = new Application({
            resizeTo: window,
        });

        document.body.appendChild(this.app.view as HTMLCanvasElement);

        this.RATIO = this.app.screen.height / GAME_HEIGHT;

        this.app.stage.scale = { x: this.RATIO, y: this.RATIO };
        this.REAL_GAME_WIDTH = this.app.screen.width / this.RATIO;

        this.loadTextures().then(() => {
            this.init();
        });
    }

    init() {
        console.log("init");
        const BACKGROUND_SCALE = GAME_HEIGHT / BACKGROUND_HEIGHT;
        const background = new TilingSprite(this.backgroundTex, this.REAL_GAME_WIDTH, GAME_HEIGHT);
        background.tileScale = {
            x: BACKGROUND_SCALE,
            y: BACKGROUND_SCALE,
        };
        this.app.stage.addChild(background);

        this.bird = this.newBird();
        this.app.stage.addChild(this.bird);
        this.bird.x = this.REAL_GAME_WIDTH / 8;
        this.bird.y = GAME_HEIGHT / 2;

        this.app.ticker.add((delta) => {
            this.birdVelocity += delta * GRAVITY;
            this.bird.y += delta * this.birdVelocity;

            if (this.birdVelocity < -FLAP_THRESH) {
                this.bird.texture = this.birdDownTex;
            } else if (this.birdVelocity > FLAP_THRESH) {
                this.bird.texture = this.birdUpTex;
            } else {
                this.bird.texture = this.birdMidTex;
            }
        });

        // bird out of bounds up or down
        this.app.ticker.add(() => {
            if (this.bird.y < 0 || this.bird.y > GAME_HEIGHT - this.bird.height) {
                this.onOverlapped();
                return;
            }
        // keeps checking if y value of bird is not overlapping.
            for (const pp of this.pipes) {
                if (!(this.bird.x > pp.p1.x - this.bird.width && this.bird.x < pp.p1.x + PIPE_WIDTH)) continue;
                if (this.bird.y < pp.p1.y || this.bird.y > pp.p2.y - this.bird.height) {
                    this.onOverlapped();
                    return;
                }
            }
        });

        this.app.renderer.events.domElement.addEventListener('pointerdown', () => { this.onClick() });
        window.addEventListener('keydown', () => { this.onClick() });

        this.app.ticker.add((delta) => {
            console.log("ticker");
            this.pipeInterval += PIPE_INTERVAL_ACCEL * delta;
            this.pipeVelocity += PIPE_VELOCITY_ACCEL * delta;
           if (Date.now() > this.lastPipeSpawned + this.pipeInterval) {
                this.lastPipeSpawned = Date.now();
                const gapStart = GAP_START + Math.random() * (GAP_END - GAP_START);
                const gapSize = GAP_MIN + Math.random() * (GAP_MAX - GAP_MIN);
                const p1 = this.newPipe();
                p1.x = this.REAL_GAME_WIDTH;
                p1.y = gapStart;
                p1.scale = { x: PIPE_SCALE, y: -PIPE_SCALE };
                const p2 = this.newPipe();
                p2.x = this.REAL_GAME_WIDTH;
                p2.y = gapStart + gapSize;
                p2.scale = { x: PIPE_SCALE, y: PIPE_SCALE };
                this.app.stage.addChild(p1);
                this.app.stage.addChild(p2);
                this.pipes.push({ p1, p2, counted: false });
            }
            for (let i = 0; i < this.pipes.length; i++) {
                const pp = this.pipes[i];
                pp.p1.x += this.pipeVelocity;
                pp.p2.x += this.pipeVelocity;
                if (pp.p1.x < -PIPE_WIDTH) {
                    this.app.stage.removeChild(pp.p1, pp.p2);
                    this.pipes.splice(i, 1);
                    i--;
                } else if (pp.p1.x < this.bird.x - PIPE_WIDTH && !pp.counted) {
                    pp.counted = true;
                    this.score++;
                    ui.setScore(this.score);
                }
            }
        });

        ui.onPlayClicked(() => {
            // ui.hideShop();
            ui.hideMain();
            this.restart();
            this.app.ticker.start();
        });

        // dirty hack to make the textures load
        this.app.ticker.addOnce(() => {
            this.app.stop();
        });
        
        //this.app.ticker.start();
        //this.app.stop();
    }

    newPipe() {
        return Sprite.from(this.pipesTex[ui.getCurrentPipe()]);
    }

    newBird() {
        return Sprite.from(this.birdMidTex);
    }

    restart() {
        for (const pp of this.pipes) {
            this.app.stage.removeChild(pp.p1, pp.p2);
        }
        this.pipes = [];
        this.pipeVelocity = -1;
        this.pipeInterval = 3000;
        this.lastPipeSpawned = 0;
        this.score = 0;
        ui.setScore(0);
        this.birdVelocity = 0;
        this.lastJump = 0;
        this.bird.y = GAME_HEIGHT / 2;
       // this.app.start();
    }

    onClick() {
        console.log("onclick");
        if (Date.now() > this.lastJump + JUMP_COOLDOWN) {
            this.lastJump = Date.now();
            this.birdVelocity = JUMP_VELOCITY;
        }
    }

    async onOverlapped() {
        this.app.stop();
        ui.showLoading();        
        ui.showMain(false);
        ui.hideLoading();
        this.restart();
    }
}

const achievements: { [k: string]: string } = {
    'first-time': 'Played 1 time',
    'five-times': 'Played 5 times',
};

const PIPES_AVAILABLE = ['pipe-green', 'pipe-red'];
const PIPES_COSTS = [0, 1];
const SHOP_RELOAD_INTERVAL = 10000;

const ENDPOINT = environment.ENDPOINT;

class UI {
    scoreDiv: HTMLDivElement = document.getElementById('score') as HTMLDivElement;
    rewardsDiv: HTMLDivElement = document.getElementById('rewards') as HTMLDivElement;
    spinnerDiv: HTMLDivElement = document.getElementById('spinner-container') as HTMLDivElement;
    // connectDiv: HTMLDivElement = document.getElementById('connect') as HTMLDivElement;
    skinChooserDiv: HTMLDivElement = document.getElementById('skin-chooser') as HTMLDivElement;
    skinPrevDiv: HTMLDivElement = document.getElementById('skin-prev') as HTMLDivElement;
    skinCurrentDiv: HTMLDivElement = document.getElementById('skin-current') as HTMLDivElement;
    skinImage: HTMLImageElement = document.getElementById('skin-image') as HTMLImageElement;
    skinNextDiv: HTMLDivElement = document.getElementById('skin-next') as HTMLDivElement;
    useButton: HTMLButtonElement = document.getElementById('use') as HTMLButtonElement;
    shopButton: HTMLButtonElement = document.getElementById('shop') as HTMLButtonElement;
    playButton: HTMLButtonElement = document.getElementById('play') as HTMLButtonElement;
    buttonsDiv: HTMLDivElement = document.getElementById('buttons') as HTMLDivElement;
    balanceDiv: HTMLDivElement = document.getElementById('balance') as HTMLDivElement;
    playTextDiv: HTMLDivElement = document.getElementById('play-text') as HTMLDivElement;
    useTextDiv: HTMLDivElement = document.getElementById('use-text') as HTMLDivElement;
    balanceContainerDiv: HTMLDivElement = document.getElementById('balance-container') as HTMLDivElement;
    afterGameDiv: HTMLDivElement = document.getElementById('after-game') as HTMLDivElement;
    errorDiv: HTMLDivElement = document.getElementById('error') as HTMLDivElement;
    tokensAwardedDiv: HTMLDivElement = document.getElementById('tokens-awarded') as HTMLDivElement;
    newAchievementsDiv: HTMLDivElement = document.getElementById('new-achievements') as HTMLDivElement;

    currentPipeIndex = Number(window.localStorage.getItem('chosen-pipe') ?? '0');
    previewPipeIndex = this.currentPipeIndex;

    shopShown = false;

    purchases: { systemName: string }[] = [];

    reloadShopTimeout: any = undefined;

    showLoading() {
        this.spinnerDiv.style.display = 'unset';
    }

    hideLoading() {
        this.spinnerDiv.style.display = 'none';
    }

    showMain(again: boolean, results?: { reward: 0, achievements: string[] } | { error: string }) {
        console.log("in show main");
        if (again) {
            this.playButton.classList.add('button-wide');
            this.playTextDiv.innerText = 'Play again';
        }
        if (results !== undefined) {
            this.afterGameDiv.style.display = 'block';
            if ('error' in results) {
                this.rewardsDiv.style.display = 'none';
                this.errorDiv.innerText = results.error;
                this.errorDiv.style.display = 'block';
            } else {
                this.errorDiv.style.display = 'none';
                this.rewardsDiv.style.display = 'flex';
                this.tokensAwardedDiv.innerText = results.reward.toString();
                if (results.achievements.length > 0) {
                    const achNodes = [results.achievements.length > 1 ? 'New achievements!' : 'New achievement!', ...results.achievements].map(a => {
                        const div = document.createElement('div');
                        div.className = 'flappy-text award-text';
                        div.innerText = a;
                        return div;
                    });
                    this.newAchievementsDiv.replaceChildren(...achNodes);
                } else {
                    this.newAchievementsDiv.replaceChildren();
                }
            }
        }
        this.buttonsDiv.style.display = 'flex';
    }

    hideMain() {
        this.afterGameDiv.style.display = 'none';
        this.buttonsDiv.style.display = 'none';
    }

    getCurrentPipe() {
        return PIPES_AVAILABLE[this.currentPipeIndex];
    }

    getPreviewPipe() {
        return PIPES_AVAILABLE[this.previewPipeIndex];
    }

    redrawShop() {
        this.skinImage.src = 'assets/' + this.getPreviewPipe() + '.png';
        this.skinPrevDiv.style.display = this.previewPipeIndex > 0 ? 'unset' : 'none';
        this.skinNextDiv.style.display = this.previewPipeIndex < PIPES_AVAILABLE.length - 1 ? 'unset' : 'none';
        const bought = this.purchases.findIndex(p => p.systemName === this.getPreviewPipe()) >= 0;
        if (this.previewPipeIndex === this.currentPipeIndex) {
            this.useTextDiv.innerText = 'Used';
            this.useButton.className = 'button-narrow';
        } else if (this.previewPipeIndex === 0 || bought) {
            this.useTextDiv.innerText = 'Use';
            this.useButton.className = 'button-narrow';
        } else {
            this.useTextDiv.innerText = 'Buy for ' + PIPES_COSTS[this.previewPipeIndex];
            this.useButton.className = 'button-narrow button-wide';
        }
    }

    async reloadPurchases() {
        this.reloadShopTimeout = undefined;

        try {
            const purchasesData = await (
              await fetch(ENDPOINT + '/purchases?auth=' + encodeURIComponent((window as any).Telegram.WebApp.initData), {
                headers: {
                  'ngrok-skip-browser-warning': 'true'
                }
              })
            ).json();
            if (!this.shopShown) return;
            if (!purchasesData.ok) throw new Error('Unsuccessful');

            this.purchases = purchasesData.purchases;

            this.redrawShop();
        } catch (e) {}

        this.reloadShopTimeout = setTimeout(() => this.reloadPurchases(), SHOP_RELOAD_INTERVAL);
    }

    setScore(score: number) {
        this.scoreDiv.innerText = score.toString();
    }

    onPlayClicked(fn: () => void) {
        this.playButton.addEventListener('click', fn);
    }

    transitionToGame() {
        //this.connectDiv.style.display = 'none';
        this.scoreDiv.style.display = 'inline-block';
        this.buttonsDiv.style.display = 'flex';
    }
}

const ui = new UI();

let game: Game | null = null;
ui.transitionToGame();
game = new Game();
