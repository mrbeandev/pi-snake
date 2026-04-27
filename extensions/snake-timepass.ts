import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, visibleWidth } from "@mariozechner/pi-tui";

const GAME_WIDTH = 40;
const GAME_HEIGHT = 15;
const INITIAL_TICK_MS = 150;
const SNAKE_SAVE_TYPE = "snake-timepass-save";

type Direction = "up" | "down" | "left" | "right";
type SpeedMode = "easy" | "hard";
type Point = { x: number; y: number };

interface GameState {
    snake: Point[];
    food: Point;
    direction: Direction;
    nextDirection: Direction;
    score: number;
    gameOver: boolean;
    highScore: number;
    wallsEnabled: boolean;
    speedMode: SpeedMode;
    baseTickMs: number;
}

function createInitialState(): GameState {
    const startX = Math.floor(GAME_WIDTH / 2);
    const startY = Math.floor(GAME_HEIGHT / 2);
    return {
        snake: [
            { x: startX, y: startY },
            { x: startX - 1, y: startY },
            { x: startX - 2, y: startY },
        ],
        food: spawnFood([{ x: startX, y: startY }]),
        direction: "right",
        nextDirection: "right",
        score: 0,
        gameOver: false,
        highScore: 0,
        wallsEnabled: false,
        speedMode: "easy",
        baseTickMs: INITIAL_TICK_MS,
    };
}

function spawnFood(snake: Point[]): Point {
    let food: Point;
    do {
        food = {
            x: Math.floor(Math.random() * GAME_WIDTH),
            y: Math.floor(Math.random() * GAME_HEIGHT),
        };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
    return food;
}

class SnakeGame {
    private state: GameState;
    private interval: ReturnType<typeof setTimeout> | null = null;
    private tui: { requestRender: () => void };
    private onSave: (state: GameState | null) => void;
    private onClose: () => void;
    private paused = true;
    private showingMenu = false;
    private version = 0;
    private cachedLines: string[] = [];
    private cachedWidth = 0;
    private cachedVersion = -1;

    constructor(
        tui: { requestRender: () => void },
        onSave: (state: GameState | null) => void,
        onClose: () => void,
        savedState?: GameState
    ) {
        this.tui = tui;
        this.onSave = onSave;
        this.onClose = onClose;

        if (savedState && !savedState.gameOver) {
            this.state = savedState;
            this.showingMenu = true; // Ask to Resume or Restart
        } else {
            this.state = createInitialState();
            if (savedState) this.state.highScore = savedState.highScore;
            this.paused = true; // Start paused as requested
        }
    }

    private startGame(): void {
        if (this.interval) clearInterval(this.interval);
        
        const getTickMs = () => {
            if (this.state.speedMode === "hard") {
                return Math.max(40, this.state.baseTickMs - (this.state.snake.length * 3));
            }
            return this.state.baseTickMs;
        };

        const loop = () => {
            if (!this.paused && !this.state.gameOver) {
                this.tick();
                this.version++;
                this.tui.requestRender();
            }
            this.interval = setTimeout(loop, getTickMs());
        };
        
        this.interval = setTimeout(loop, getTickMs());
    }

    private tick(): void {
        this.state.direction = this.state.nextDirection;
        const head = this.state.snake[0];
        let newHead: Point;

        switch (this.state.direction) {
            case "up": newHead = { x: head.x, y: head.y - 1 }; break;
            case "down": newHead = { x: head.x, y: head.y + 1 }; break;
            case "left": newHead = { x: head.x - 1, y: head.y }; break;
            case "right": newHead = { x: head.x + 1, y: head.y }; break;
            default: newHead = head;
        }

        if (!this.state.wallsEnabled) {
            if (newHead.x < 0) newHead.x = GAME_WIDTH - 1;
            else if (newHead.x >= GAME_WIDTH) newHead.x = 0;
            if (newHead.y < 0) newHead.y = GAME_HEIGHT - 1;
            else if (newHead.y >= GAME_HEIGHT) newHead.y = 0;
        }

        if (this.state.wallsEnabled && (newHead.x < 0 || newHead.x >= GAME_WIDTH || newHead.y < 0 || newHead.y >= GAME_HEIGHT)) {
            this.state.gameOver = true;
            return;
        }

        if (this.state.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
            this.state.gameOver = true;
            return;
        }

        this.state.snake.unshift(newHead);
        if (newHead.x === this.state.food.x && newHead.y === this.state.food.y) {
            this.state.score += 10;
            if (this.state.score > this.state.highScore) this.state.highScore = this.state.score;
            this.state.food = spawnFood(this.state.snake);
        } else {
            this.state.snake.pop();
        }
    }

    handleInput(data: string): void {
        if (data.toLowerCase() === 'q') {
            this.onClose();
            return;
        }

        if (data.toLowerCase() === 'm') {
            this.state.wallsEnabled = !this.state.wallsEnabled;
            this.version++;
            this.tui.requestRender();
            return;
        }

        if (data.toLowerCase() === 'h') {
            this.state.speedMode = this.state.speedMode === "easy" ? "hard" : "easy";
            this.version++;
            this.tui.requestRender();
            return;
        }

        if (data === '+' || data === '=') {
            this.state.baseTickMs = Math.max(40, this.state.baseTickMs - 10);
            this.version++;
            this.tui.requestRender();
            return;
        }

        if (data === '-' || data === '_') {
            this.state.baseTickMs = Math.min(500, this.state.baseTickMs + 10);
            this.version++;
            this.tui.requestRender();
            return;
        }

        if (this.showingMenu) {
            if (data.toLowerCase() === 'r') {
                const hs = this.state.highScore;
                this.state = createInitialState();
                this.state.highScore = hs;
                this.showingMenu = false;
                this.paused = false;
                this.startGame();
            } else if (data.toLowerCase() === 'c' || matchesKey(data, "enter")) {
                this.showingMenu = false;
                this.paused = false;
                this.startGame();
            }
            this.tui.requestRender();
            return;
        }

        if (this.paused) {
            this.paused = false;
            this.startGame();
            this.tui.requestRender();
            return;
        }

        if (matchesKey(data, "escape") || data.toLowerCase() === 'q') {
            this.onClose();
            return;
        }

        if (matchesKey(data, "up") || data === "w") { if (this.state.direction !== "down") this.state.nextDirection = "up"; }
        else if (matchesKey(data, "down") || data === "s") { if (this.state.direction !== "up") this.state.nextDirection = "down"; }
        else if (matchesKey(data, "left") || data === "a") { if (this.state.direction !== "right") this.state.nextDirection = "left"; }
        else if (matchesKey(data, "right") || data === "d") { if (this.state.direction !== "left") this.state.nextDirection = "right"; }

        if (this.state.gameOver && (data === "r" || data === " ")) {
            const hs = this.state.highScore;
            this.state = createInitialState();
            this.state.highScore = hs;
            this.version++;
            this.tui.requestRender();
        }
    }

    invalidate(): void {
        this.cachedWidth = 0;
    }

    render(width: number): string[] {
        if (width === this.cachedWidth && this.cachedVersion === this.version) return this.cachedLines;

        const lines: string[] = [];
        const cellWidth = 2;
        const boxWidth = GAME_WIDTH * cellWidth;
        const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
        const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
        const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
        const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
        const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;

        const centerPad = Math.max(0, Math.floor((width - (boxWidth + 4)) / 2));
        const pad = (line: string) => " ".repeat(centerPad) + line + " ".repeat(Math.max(0, width - visibleWidth(line) - centerPad));
        const boxLine = (content: string) => dim(" │") + content + " ".repeat(Math.max(0, boxWidth - visibleWidth(content))) + dim("│");

        lines.push(pad(dim(` ╭${"─".repeat(boxWidth)}╮`)));
        const speedVal = this.state.speedMode === "hard" 
            ? Math.max(40, this.state.baseTickMs - (this.state.snake.length * 3))
            : this.state.baseTickMs;
        const header = `${bold(green(" SNAKE "))} │ Score: ${yellow(String(this.state.score))} │ Walls: ${this.state.wallsEnabled ? red("ON") : green("OFF")} │ Speed: ${yellow(speedVal + "ms")} │ Mode: ${this.state.speedMode === "hard" ? red("HARD") : green("EASY")} (+/-)`;
        lines.push(pad(boxLine(header)));
        lines.push(pad(dim(` ├${"─".repeat(boxWidth)}┤`)));

        for (let y = 0; y < GAME_HEIGHT; y++) {
            let row = "";
            for (let x = 0; x < GAME_WIDTH; x++) {
                if (this.state.snake[0].x === x && this.state.snake[0].y === y) row += green("██");
                else if (this.state.snake.some(s => s.x === x && s.y === y)) row += green("▓▓");
                else if (this.state.food.x === x && this.state.food.y === y) row += red("◆ ");
                else row += "  ";
            }
            lines.push(pad(dim(" │") + row + dim("│")));
        }

        lines.push(pad(dim(` ├${"─".repeat(boxWidth)}┤`)));
        
        let footer = "";
        if (this.showingMenu) footer = `${bold(yellow("RESUME?"))} [${bold("C")}]ontinue, [${bold("R")}]estart, [${bold("M")}]walls, [${bold("H")}]mode, [${bold("Q")}]uit`;
        else if (this.state.gameOver) footer = `${red(bold("GAME OVER!"))} [${bold("R")}]restart, [${bold("M")}]walls, [${bold("H")}]mode, [${bold("Q")}]quit`;
        else if (this.paused) footer = `${yellow(bold("PAUSED"))} Key:play, [${bold("M")}]walls, [${bold("H")}]mode, [${bold("+/-")}]speed, [${bold("Q")}]quit`;
        else footer = `Arrows/WASD:move, [${bold("M")}]walls, [${bold("H")}]mode, [${bold("+/-")}]speed, [${bold("Q")}]quit`;
        
        lines.push(pad(boxLine(footer)));
        lines.push(pad(dim(` ╰${"─".repeat(boxWidth)}╯`)));

        this.cachedLines = lines;
        this.cachedWidth = width;
        this.cachedVersion = this.version;
        return lines;
    }

    dispose(): void {
        if (this.interval) clearInterval(this.interval);
        this.onSave(this.state);
    }
}

let activeDone: ((val: any) => void) | null = null;
let activeGame: SnakeGame | null = null;

export default function (pi: ExtensionAPI) {
    pi.registerCommand("snake", {
        description: "Play Snake time-pass manually",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI) return;

            const entries = ctx.sessionManager.getEntries();
            let savedState: GameState | undefined;
            for (let i = entries.length - 1; i >= 0; i--) {
                const entry = entries[i];
                if (entry.type === "custom" && entry.customType === SNAKE_SAVE_TYPE) {
                    savedState = entry.data as GameState;
                    break;
                }
            }

            await ctx.ui.custom((tui, _theme, _kb, done) => {
                const game = new SnakeGame(
                    tui,
                    (state) => pi.appendEntry(SNAKE_SAVE_TYPE, state),
                    () => done(undefined),
                    savedState
                );
                return game;
            });
        },
    });

    pi.on("agent_start", async (_event, ctx) => {
        if (!ctx.hasUI) return;

        ctx.ui.setWidget("snake-game", []); // Reserve space on top

        // Find saved state
        const entries = ctx.sessionManager.getEntries();
        let savedState: GameState | undefined;
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];
            if (entry.type === "custom" && entry.customType === SNAKE_SAVE_TYPE) {
                savedState = entry.data as GameState;
                break;
            }
        }

        ctx.ui.custom((tui, _theme, _kb, done) => {
            activeDone = done;
            activeGame = new SnakeGame(
                tui,
                (state) => pi.appendEntry(SNAKE_SAVE_TYPE, state),
                () => done(undefined),
                savedState
            );
            return activeGame;
        });
    });

    pi.on("agent_end", async () => {
        if (activeDone) {
            activeGame?.dispose();
            activeDone(undefined);
            activeDone = null;
            activeGame = null;
        }
    });
}
